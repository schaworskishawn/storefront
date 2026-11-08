import nextVitals from "eslint-config-next/core-web-vitals";

const config = [
	...nextVitals,
	{
		// android/, ios/ and worldwide-ai-android/android/ are the Capacitor native projects; their build output (e.g. a copied native-bridge.js) isn't ours to lint.
		ignores: [
			".next/**",
			"out/**",
			"build/**",
			"android/**",
			"ios/**",
			"worldwide-ai-android/android/**",
			"next-env.d.ts",
		],
	},
];

export default config;
