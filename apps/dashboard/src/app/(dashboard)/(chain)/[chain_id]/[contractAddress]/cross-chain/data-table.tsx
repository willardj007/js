"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getThirdwebClient } from "@/constants/thirdweb.server";
import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { verifyContract } from "app/(dashboard)/(chain)/[chain_id]/[contractAddress]/sources/ContractSourcesPage";
import {
  type DeployModalStep,
  DeployStatusModal,
  useDeployStatusModal,
} from "components/contract-components/contract-deploy-form/deploy-context-modal";
import {
  getModuleInstallParams,
  showPrimarySaleFiedset,
  showRoyaltyFieldset,
  showSuperchainBridgeFieldset,
} from "components/contract-components/contract-deploy-form/modular-contract-default-modules-fieldset";
import { useTxNotifications } from "hooks/useTxNotifications";
import {
  ZERO_ADDRESS,
  defineChain,
  getContract,
  readContract,
  sendTransaction,
  waitForReceipt,
} from "thirdweb";
import type {
  FetchDeployMetadataResult,
  ThirdwebContract,
} from "thirdweb/contract";
import { deployContractfromDeployMetadata } from "thirdweb/deploys";
import { installPublishedModule } from "thirdweb/modules";
import { useActiveAccount, useSwitchActiveWalletChain } from "thirdweb/react";
import {
  type AbiFunction,
  concatHex,
  encodeAbiParameters,
  padHex,
} from "thirdweb/utils";

export type CrossChain = {
  id: number;
  network: string;
  chainId: number;
  status: "DEPLOYED" | "NOT_DEPLOYED";
};

export function DataTable({
  data,
  coreMetadata,
  coreContract,
  modulesMetadata,
  initializeData,
}: {
  data: CrossChain[];
  coreMetadata: FetchDeployMetadataResult;
  coreContract: ThirdwebContract;
  modulesMetadata: FetchDeployMetadataResult[];
  initializeData?: `0x${string}`;
}) {
  const activeAccount = useActiveAccount();
  const switchChain = useSwitchActiveWalletChain();
  const deployStatusModal = useDeployStatusModal();
  const { onError } = useTxNotifications(
    "Successfully deployed contract",
    "Failed to deploy contract",
  );

  const columns: ColumnDef<CrossChain>[] = [
    {
      accessorKey: "network",
      header: "Network",
    },
    {
      accessorKey: "chainId",
      header: "Chain ID",
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => {
        if (row.getValue("status") === "DEPLOYED") {
          return <Badge variant="success">Deployed</Badge>;
        }
        return (
          <Button onClick={() => deployContract(row.getValue("chainId"))}>
            Deploy
          </Button>
        );
      },
    },
  ];

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  const deployContract = async (chainId: number) => {
    try {
      if (!activeAccount) {
        throw new Error("No active account");
      }

      // TODO: deploy the core contract directly with the initializer calldata

      const chain = defineChain(chainId);
      const client = getThirdwebClient();
      const salt = concatHex(["0x0101", padHex("0x", { size: 30 })]).toString();

      await switchChain(chain);

      const steps: DeployModalStep[] = [
        {
          type: "deploy",
          signatureCount: 1,
        },
      ];

      deployStatusModal.setViewContractLink("");
      deployStatusModal.open(steps);

      const crosschainContractAddress = await deployContractfromDeployMetadata({
        account: activeAccount,
        chain,
        client,
        deployMetadata: {
          ...coreMetadata,
          deployType: "crosschain" as const,
        },
        initializeData,
        salt,
      });

      await verifyContract({
        address: crosschainContractAddress,
        chain,
        client,
      });

      const owner = await readContract({
        contract: coreContract,
        method: "function owner() view returns (address)",
        params: [],
      });

      const moduleInitializeParams = modulesMetadata.reduce(
        (acc, mod) => {
          const params = getModuleInstallParams(mod);
          const paramNames = params
            .map((param) => param.name)
            .filter((p) => p !== undefined);
          const returnVal: Record<string, string> = {};

          // set connected wallet address as default "royaltyRecipient"
          if (showRoyaltyFieldset(paramNames)) {
            returnVal.royaltyRecipient = owner || "";
            returnVal.royaltyBps = "0";
            returnVal.transferValidator = ZERO_ADDRESS;
          }

          // set connected wallet address as default "primarySaleRecipient"
          else if (showPrimarySaleFiedset(paramNames)) {
            returnVal.primarySaleRecipient = owner || "";
          }

          // set superchain bridge address
          else if (showSuperchainBridgeFieldset(paramNames)) {
            returnVal.superchainBridge =
              "0x4200000000000000000000000000000000000010"; // OP Superchain Bridge
          }

          acc[mod.name] = returnVal;
          return acc;
        },
        {} as Record<string, Record<string, string>>,
      );

      const moduleDeployData = modulesMetadata.map((m) => ({
        deployMetadata: m,
        initializeParams: moduleInitializeParams[m.name],
      }));

      const contract = getContract({
        address: crosschainContractAddress,
        chain,
        client,
      });

      await Promise.all(
        moduleDeployData.map(async (m) => {
          let moduleData: `0x${string}` | undefined;

          const moduleInstallParams = m.deployMetadata.abi.find(
            (abiType) =>
              (abiType as AbiFunction).name === "encodeBytesOnInstall",
          ) as AbiFunction | undefined;

          if (m.initializeParams && moduleInstallParams) {
            moduleData = encodeAbiParameters(
              (
                moduleInstallParams.inputs as { name: string; type: string }[]
              ).map((p) => ({
                name: p.name,
                type: p.type,
              })),
              Object.values(m.initializeParams),
            );
          }

          const installTransaction = installPublishedModule({
            contract,
            account: activeAccount,
            moduleName: m.deployMetadata.name,
            publisher: m.deployMetadata.publisher,
            version: m.deployMetadata.version,
            moduleData,
          });

          const txResult = await sendTransaction({
            transaction: installTransaction,
            account: activeAccount,
          });

          return await waitForReceipt(txResult);
        }),
      );

      deployStatusModal.nextStep();
      deployStatusModal.setViewContractLink(
        `/${chain.id}/${crosschainContractAddress}`,
      );
    } catch (e) {
      onError(e);
      console.error("failed to deploy contract", e);
      deployStatusModal.close();
    }
  };

  return (
    <TableContainer>
      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id}>
              {headerGroup.headers.map((header) => {
                return (
                  <TableHead key={header.id}>
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext(),
                        )}
                  </TableHead>
                );
              })}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows.map((row) => (
            <TableRow
              key={row.id}
              data-state={row.getIsSelected() && "selected"}
            >
              {row.getVisibleCells().map((cell) => (
                <TableCell key={cell.id}>
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <DeployStatusModal deployStatusModal={deployStatusModal} />
    </TableContainer>
  );
}
