"use client";

import { Spinner } from "@/components/ui/Spinner/Spinner";
import { useLoggedInUser } from "@3rdweb-sdk/react/hooks/useLoggedInUser";
//import { Heading, LinkButton } from "tw-components";
import { Heading } from "tw-components";

export const ChainGuidesPage = () => {
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
          View a getting started video
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

        <iframe
          src="https://www.loom.com/share/07a178f96bac4e3fb380f9a188bd667c"
          title="Chain Getting Started"
          frameBorder="0"
          allowFullScreen
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
          }}
        />
      </div>
    </div>
  );
};
