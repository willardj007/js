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
import { replaceTemplateValues } from "lib/deployment/template-values";
import { ZERO_ADDRESS, defineChain } from "thirdweb";
import type { FetchDeployMetadataResult } from "thirdweb/contract";
import { deployContractfromDeployMetadata } from "thirdweb/deploys";
import { useActiveAccount, useSwitchActiveWalletChain } from "thirdweb/react";
import { concatHex, padHex } from "thirdweb/utils";

export type CrossChain = {
  id: number;
  network: string;
  chainId: number;
  status: "DEPLOYED" | "NOT_DEPLOYED";
};

export function DataTable({
  data,
  coreMetadata,
  modulesMetadata,
  erc20InitialData: [_name, _symbol, _contractURI, _owner],
}: {
  data: CrossChain[];
  coreMetadata: FetchDeployMetadataResult;
  modulesMetadata: FetchDeployMetadataResult[];
  erc20InitialData: string[];
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

      // TODO: fetch the ContractIntialized event
      // Guessing it has to fetch the transaction hash based on the contract address
      // Then fetch the block number from the transaction hash
      // Then fetch the event by limiting the block number

      const coreInitializeParams = {
        ...(
          coreMetadata.abi
            .filter((a) => a.type === "function")
            .find((a) => a.name === "initialize")?.inputs || []
        ).reduce(
          (acc, param) => {
            if (!param.name) {
              param.name = "*";
            }

            acc[param.name] = replaceTemplateValues(
              coreMetadata?.constructorParams?.[param.name]?.defaultValue
                ? coreMetadata?.constructorParams?.[param.name]?.defaultValue ||
                    ""
                : param.name === "_royaltyBps" ||
                    param.name === "_platformFeeBps"
                  ? "0"
                  : "",
              param.type,
              {
                connectedWallet: "0x0000000000000000000000000000000000000000",
                chainId: 1,
              },
            );

            return acc;
          },
          {} as Record<string, string>,
        ),
        _name,
        _symbol,
        _contractURI,
        _owner,
      };

      const moduleInitializeParams = modulesMetadata.reduce(
        (acc, mod) => {
          const params = getModuleInstallParams(mod);
          const paramNames = params
            .map((param) => param.name)
            .filter((p) => p !== undefined);
          const returnVal: Record<string, string> = {};

          // set connected wallet address as default "royaltyRecipient"
          if (showRoyaltyFieldset(paramNames)) {
            returnVal.royaltyRecipient = _owner || "";
            returnVal.royaltyBps = "0";
            returnVal.transferValidator = ZERO_ADDRESS;
          }

          // set connected wallet address as default "primarySaleRecipient"
          else if (showPrimarySaleFiedset(paramNames)) {
            returnVal.primarySaleRecipient = _owner || "";
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
        deployMetadata: coreMetadata,
        initializeParams: coreInitializeParams,
        salt,
        modules: modulesMetadata.map((m) => ({
          deployMetadata: m,
          initializeParams: moduleInitializeParams[m.name],
        })),
      });

      await verifyContract({
        address: crosschainContractAddress,
        chain,
        client,
      });

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
