import { ChakraProviderSetup } from "@/components/ChakraProviderSetup";
import { ChainGuidesPage } from "./ChainGuidesPage";

export default function Page() {
  return (
    <ChakraProviderSetup>
      <ChainGuidesPage />
    </ChakraProviderSetup>
  );
}
