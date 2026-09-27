import { useSyncExternalStore } from "react";
import { type CountryCode } from "@/checkout/graphql";

export const getCurrentHref = () => location.href;

const countryNames = new Intl.DisplayNames("EN-US", {
	type: "region",
});
export const getCountryName = (countryCode: CountryCode): string =>
	countryNames.of(countryCode) || countryCode;

/**
 * Country label helper safe for SSR. `Intl.DisplayNames` output differs between Node and the browser
 * (e.g. "Falkland Islands (Islas Malvinas)" vs "Falkland Islands"), which breaks hydration of the whole
 * checkout form. Until mounted it returns the ISO code on both server and client, then real names.
 */
export function useCountryName(): (countryCode: CountryCode) => string {
	const mounted = useSyncExternalStore(
		() => () => {},
		() => true,
		() => false,
	);
	return (countryCode) => (mounted ? getCountryName(countryCode) : countryCode);
}
