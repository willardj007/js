import { ChakraProviderSetup } from "@/components/ChakraProviderSetup";
import { ChainOnboardingPage } from "./ChainOnboardingPage";

export default function Page() {
  return (
    <ChakraProviderSetup>
      <ChainOnboardingPage />
    </ChakraProviderSetup>
  );
}
