"use client";
import { PlasmicRootProvider } from "@plasmicapp/loader-nextjs";
import { PLASMIC } from "./plasmic-init";
import React from "react";

export function PlasmicClientRootProvider(
	props: Omit<React.ComponentProps<typeof PlasmicRootProvider>, "loader">,
) {
	return <PlasmicRootProvider loader={PLASMIC} {...props} />;
}
