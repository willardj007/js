import { fetchPublishedContractsFromDeploy } from "components/contract-components/fetchPublishedContractsFromDeploy";
import { notFound } from "next/navigation";
import {
  eth_getTransactionByHash,
  eth_getTransactionReceipt,
  getContractEvents,
  parseEventLogs,
  prepareEvent,
} from "thirdweb";
import { defineChain, getChainMetadata, localhost } from "thirdweb/chains";
import {
  type FetchDeployMetadataResult,
  getContract,
  getDeployedCloneFactoryContract,
  resolveContractAbi,
} from "thirdweb/contract";
import { moduleInstalledEvent } from "thirdweb/modules";
import { eth_getCode, getRpcClient } from "thirdweb/rpc";
import type { TransactionReceipt } from "thirdweb/transaction";
import { type AbiFunction, decodeFunctionData } from "thirdweb/utils";
import { getContractPageParamsInfo } from "../_utils/getContractFromParams";
import { getContractPageMetadata } from "../_utils/getContractPageMetadata";
import { DataTable } from "./data-table";

export function getModuleInstallParams(mod: FetchDeployMetadataResult) {
  return (
    mod.abi
      .filter((a) => a.type === "function")
      .find((f) => f.name === "encodeBytesOnInstall")?.inputs || []
  );
}

export default async function Page(props: {
  params: Promise<{
    contractAddress: string;
    chain_id: string;
  }>;
}) {
  const params = await props.params;
  const info = await getContractPageParamsInfo(params);

  if (!info) {
    notFound();
  }

  const { contract } = info;

  const { isModularCore } = await getContractPageMetadata(contract);

  const ProxyDeployedEvent = prepareEvent({
    signature:
      "event ProxyDeployedV2(address indexed implementation, address indexed proxy, address indexed deployer, bytes32 inputSalt, bytes data, bytes extraData)",
  });

  const twCloneFactoryContract = await getDeployedCloneFactoryContract({
    chain: contract.chain,
    client: contract.client,
  });

  const originalCode = await eth_getCode(
    getRpcClient({
      client: contract.client,
      chain: contract.chain,
    }),
    {
      address: contract.address,
    },
  );

  let initCode: `0x${string}` = "0x";
  let creationTxReceipt: TransactionReceipt | undefined;
  let isDirectDeploy = false;
  let isProxyDeploy = false;
  try {
    const res = await fetch(
      `https://contract.thirdweb-dev.com/creation/${contract.chain.id}/${contract.address}`,
    );
    const creationData = await res.json();

    if (creationData.status === "1" && creationData.result[0]?.txHash) {
      const rpcClient = getRpcClient({
        client: contract.client,
        chain: contract.chain,
      });
      creationTxReceipt = await eth_getTransactionReceipt(rpcClient, {
        hash: creationData.result[0]?.txHash,
      });

      const creationTx = await eth_getTransactionByHash(rpcClient, {
        hash: creationData.result[0]?.txHash,
      });

      initCode = creationTx.input;
      isDirectDeploy =
        creationTx.to === "0x4e59b44847b379578588920cA78FbF26c0B4956C";
      isProxyDeploy =
        !!twCloneFactoryContract &&
        creationTx.to === twCloneFactoryContract?.address;
    }
  } catch (e) {
    console.debug(e);
  }

  if (!isDirectDeploy && !isProxyDeploy) {
    if (contract.chain.id === localhost.id) {
      return <div>Not supported</div>;
    }
  }

  let initializeData: `0x${string}` | undefined;
  let inputSalt: `0x${string}` | undefined;
  let creationBlockNumber: bigint | undefined;

  if (isProxyDeploy && twCloneFactoryContract) {
    const events = await getContractEvents({
      contract: twCloneFactoryContract,
      events: [ProxyDeployedEvent],
      blockRange: 123456n,
    });
    const event = events.find((e) => e.args.proxy === params.contractAddress);

    initializeData = event?.args.data;
    inputSalt = event?.args.inputSalt;
    creationBlockNumber = event?.blockNumber;
  }

  const topOPStackTestnetChainIds = [
    84532, // Base
    11155420, // OP testnet
    919, // Mode Network
    111557560, // Cyber
    999999999, // Zora
    11155111, // sepolia
    421614,
  ];

  const chainsDeployedOn = await Promise.all(
    topOPStackTestnetChainIds.map(async (chainId) => {
      // eslint-disable-next-line no-restricted-syntax
      const chain = defineChain(chainId);
      const chainMetadata = await getChainMetadata(chain);

      const rpcRequest = getRpcClient({
        client: contract.client,
        chain,
      });
      const code = await eth_getCode(rpcRequest, {
        address: params.contractAddress,
      });

      return {
        id: chainId,
        network: chainMetadata.name,
        chainId: chain.id,
        status:
          code === originalCode
            ? ("DEPLOYED" as const)
            : ("NOT_DEPLOYED" as const),
      };
    }),
  );

  const coreMetadata = (
    await fetchPublishedContractsFromDeploy({
      contract,
      client: contract.client,
    })
  ).at(-1) as FetchDeployMetadataResult;

  let modulesMetadata: FetchDeployMetadataResult[] | undefined;

  if (isModularCore) {
    let modules: string[] | undefined;
    const moduleEvent = moduleInstalledEvent();
    // extract module address in ModuleInstalled events from transaction receipt
    if (creationTxReceipt) {
      const decodedEvent = parseEventLogs({
        events: [moduleEvent],
        logs: creationTxReceipt.logs,
      });

      modules = decodedEvent.map((e) => e.args.installedModule);
    }

    // fetch events from contract
    if (!modules && creationBlockNumber) {
      const events = await getContractEvents({
        contract: contract,
        events: [moduleEvent],
        blockRange: 123456n,
      });

      const filteredEvents = events.filter(
        (e) => e.blockNumber === creationBlockNumber,
      );

      modules = filteredEvents.map((e) => e.args.installedModule);
    }

    // if receipt not available, try extracting module address from initialize data
    if (!modules && initializeData) {
      // biome-ignore lint/suspicious/noExplicitAny: FIXME
      const decodedData: any = await decodeFunctionData({
        contract,
        data: initializeData,
      });

      const abi = await resolveContractAbi(contract).catch(() => undefined);

      if (abi) {
        const initializeFunction = abi.find(
          (i: AbiFunction) => i.type === "function" && i.name === "initialize",
        ) as unknown as AbiFunction;

        const moduleIndex = initializeFunction.inputs.findIndex(
          (i) => i.name === "_modules" || i.name === "modules",
        );

        modules = moduleIndex ? decodedData[moduleIndex] : undefined;
      }
    }

    modulesMetadata = modules
      ? ((await Promise.all(
          modules.map(async (m) =>
            (
              await fetchPublishedContractsFromDeploy({
                contract: getContract({
                  chain: contract.chain,
                  client: contract.client,
                  address: m,
                }),
                client: contract.client,
              })
            ).at(-1),
          ),
        )) as FetchDeployMetadataResult[])
      : undefined;
  }

  return (
    <DataTable
      coreMetadata={coreMetadata}
      modulesMetadata={modulesMetadata}
      initializeData={initializeData}
      inputSalt={inputSalt}
      data={chainsDeployedOn}
      coreContract={contract}
      initCode={initCode}
      isDirectDeploy={isDirectDeploy}
    />
  );
}
