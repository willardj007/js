"use client";

import { Button } from "@/components/ui/button";
import { Form } from "@/components/ui/form";
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
import { zodResolver } from "@hookform/resolvers/zod";
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
import {} from "components/contract-components/contract-deploy-form/modular-contract-default-modules-fieldset";
import { useTxNotifications } from "hooks/useTxNotifications";
import Link from "next/link";
import { useForm } from "react-hook-form";
import {
  defineChain,
  eth_getCode,
  getRpcClient,
  prepareTransaction,
  sendAndConfirmTransaction,
} from "thirdweb";
import type {
  FetchDeployMetadataResult,
  ThirdwebContract,
} from "thirdweb/contract";
import {
  deployContractfromDeployMetadata,
  getOrDeployInfraForPublishedContract,
} from "thirdweb/deploys";
import { useActiveAccount, useSwitchActiveWalletChain } from "thirdweb/react";
import { concatHex, padHex } from "thirdweb/utils";
import { z } from "zod";

type CrossChain = {
  id: number;
  network: string;
  chainId: number;
  status: "DEPLOYED" | "NOT_DEPLOYED";
};

type ChainId =
  | "84532"
  | "11155420"
  | "919"
  | "111557560"
  | "999999999"
  | "11155111"
  | "421614";

const formSchema = z.object({
  amounts: z.object({
    "84532": z.string(),
    "11155420": z.string(),
    "919": z.string(),
    "111557560": z.string(),
    "999999999": z.string(),
    "11155111": z.string(),
    "421614": z.string(),
  }),
});
type FormSchema = z.output<typeof formSchema>;

export function DataTable({
  data,
  coreMetadata,
  coreContract,
  modulesMetadata,
  initializeData,
  inputSalt,
  initCode,
  isDirectDeploy,
}: {
  data: CrossChain[];
  coreMetadata: FetchDeployMetadataResult;
  coreContract: ThirdwebContract;
  modulesMetadata?: FetchDeployMetadataResult[];
  initializeData?: `0x${string}`;
  inputSalt?: `0x${string}`;
  initCode?: `0x${string}`;
  isDirectDeploy: boolean;
}) {
  const activeAccount = useActiveAccount();
  const switchChain = useSwitchActiveWalletChain();
  const deployStatusModal = useDeployStatusModal();
  const { onError } = useTxNotifications(
    "Successfully deployed contract",
    "Failed to deploy contract",
  );

  const form = useForm<FormSchema>({
    resolver: zodResolver(formSchema),
    values: {
      amounts: {
        "84532": "", // Base
        "11155420": "", // OP testnet
        "919": "", // Mode Network
        "111557560": "", // Cyber
        "999999999": "", // Zora
        "11155111": "", // Sepolia
        "421614": "",
      },
    },
  });

  const columns: ColumnDef<CrossChain>[] = [
    {
      accessorKey: "network",
      header: "Network",
      cell: ({ row }) => {
        if (row.getValue("status") === "DEPLOYED") {
          return (
            <Link
              target="_blank"
              className="text-blue-500 underline"
              href={`/${row.getValue("chainId")}/${coreContract.address}`}
            >
              {row.getValue("network")}
            </Link>
          );
        }
        return row.getValue("network");
      },
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
          return <p>Deployed</p>;
        }
        return (
          <Button
            type="button"
            onClick={() => deployContract(row.getValue("chainId"))}
          >
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

      // eslint-disable-next-line no-restricted-syntax
      const chain = defineChain(chainId);
      const client = getThirdwebClient();
      const salt =
        inputSalt ||
        concatHex(["0x0101", padHex("0x", { size: 30 })]).toString();

      await switchChain(chain);

      const steps: DeployModalStep[] = [
        {
          type: "deploy",
          signatureCount: 1,
        },
      ];

      deployStatusModal.setViewContractLink("");
      deployStatusModal.open(steps);

      const isCrosschain = !!modulesMetadata?.find(
        (m) => m.name === "SuperChainInterop",
      );

      let crosschainContractAddress: string | undefined;
      if (initCode && isDirectDeploy) {
        const tx = prepareTransaction({
          client,
          chain,
          to: "0x4e59b44847b379578588920cA78FbF26c0B4956C",
          data: initCode,
        });

        await sendAndConfirmTransaction({
          transaction: tx,
          account: activeAccount,
        });

        const code = await eth_getCode(
          getRpcClient({
            client,
            chain,
          }),
          {
            address: coreContract.address,
          },
        );

        if (code && code.length > 2) {
          crosschainContractAddress = coreContract.address;
        }
      } else {
        crosschainContractAddress = await deployContractfromDeployMetadata({
          account: activeAccount,
          chain,
          client,
          deployMetadata: coreMetadata,
          isCrosschain: true,
          initializeData,
          salt,
        });

        verifyContract({
          address: crosschainContractAddress,
          chain,
          client,
        });
        if (isCrosschain && modulesMetadata) {
          for (const m of modulesMetadata) {
            await getOrDeployInfraForPublishedContract({
              chain,
              client,
              account: activeAccount,
              contractId: m.name,
              publisher: m.publisher,
            });
          }
        }
      }
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
    <Form {...form}>
      <form>
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
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext(),
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <DeployStatusModal deployStatusModal={deployStatusModal} />
        </TableContainer>
      </form>
    </Form>
  );
}
