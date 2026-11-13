import nextVitals from "eslint-config-next/core-web-vitals";

const config = [
	...nextVitals,
	{
		// android/ and ios/ are the Capacitor native projects; their build output (e.g. a copied native-bridge.js) isn't ours to lint.
		ignores: [".next/**", "out/**", "build/**", "android/**", "ios/**", "next-env.d.ts"],
	},
];

export default config;
