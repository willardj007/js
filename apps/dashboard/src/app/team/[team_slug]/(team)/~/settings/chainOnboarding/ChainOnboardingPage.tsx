"use client";

import { Spinner } from "@/components/ui/Spinner/Spinner";
import { useLoggedInUser } from "@3rdweb-sdk/react/hooks/useLoggedInUser";
//import { Heading, LinkButton } from "tw-components";
import { Heading } from "tw-components";

export const ChainOnboardingPage = () => {
  const { isPending } = useLoggedInUser();

  if (isPending) {
    return (
      <div className="grid min-h-[400px] w-full place-items-center">
        <Spinner className="size-10" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-row items-center gap-4">
        <Heading size="title.lg" as="h1">
          Fill in all the info for your chain.
        </Heading>
        {/* <LinkButton
          display={{ base: "none", md: "inherit" }}
          isExternal
          href="https://blog.thirdweb.com/accelerating-the-superchain-with-optimism/"
          size="sm"
          variant="outline"
        >
          Go To Form
        </LinkButton> */}
        <iframe
          src="https://full-heptagon-117567.framer.app/"
          title="Embedded Framer Site"
          width="100%"
          height="600px"
          frameBorder="0"
          allowFullScreen
        />
      </div>
    </div>
  );
};
