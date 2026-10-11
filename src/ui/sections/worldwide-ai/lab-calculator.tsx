"use client";

import { useMemo, useState } from "react";
import { RecipeError, calculateRecipe, type RecipeInput } from "@/lib/worldwide-ai/lab/recipe";

/**
 * The recipe calculator. It calculates in the browser, in exact decimals, as the numbers are typed, and keeps nothing: this
 * is a calculator, not a recipe record or a batch record. Weights appear only where a documented density is entered.
 */

type Flavour = RecipeInput["flavours"][number];
const blankFlavour = (): Flavour => ({
	name: "",
	percent: "",
	pgPercent: "100",
	vgPercent: "0",
	density: "",
});

const START: RecipeInput = {
	batchMl: "1000",
	targetNicotineMgPerMl: "12",
	targetPgPercent: "50",
	nicotineBase: { strengthMgPerMl: "100", pgPercent: "100", vgPercent: "0", density: "" },
	flavours: [blankFlavour()],
	pgDensity: "",
	vgDensity: "",
};

function Num({
	id,
	label,
	value,
	onChange,
	help,
	suffix,
}: {
	id: string;
	label: string;
	value: string;
	onChange: (value: string) => void;
	help?: string;
	suffix?: string;
}) {
	return (
		<div className="wai-field">
			<label htmlFor={id}>
				{label}
				{suffix ? <span className="wai-muted"> ({suffix})</span> : null}
			</label>
			<input
				id={id}
				className="wai-input"
				inputMode="decimal"
				autoComplete="off"
				value={value}
				onChange={(event) => onChange(event.target.value)}
				aria-describedby={help ? `${id}-help` : undefined}
			/>
			{help && (
				<span className="wai-help" id={`${id}-help`}>
					{help}
				</span>
			)}
		</div>
	);
}

export function LabCalculator() {
	const [input, setInput] = useState<RecipeInput>(START);
	const set = (changes: Partial<RecipeInput>) => setInput((current) => ({ ...current, ...changes }));
	const setBase = (changes: Partial<RecipeInput["nicotineBase"]>) =>
		setInput((current) => ({ ...current, nicotineBase: { ...current.nicotineBase, ...changes } }));
	const setFlavour = (index: number, changes: Partial<Flavour>) =>
		setInput((current) => ({
			...current,
			flavours: current.flavours.map((flavour, i) => (i === index ? { ...flavour, ...changes } : flavour)),
		}));

	const outcome = useMemo(() => {
		try {
			return { result: calculateRecipe(input), error: null };
		} catch (error) {
			return {
				result: null,
				error: error instanceof RecipeError ? error.message : "That couldn't be calculated.",
			};
		}
	}, [input]);

	return (
		<div className="wai-split">
			<div className="wai-stack">
				<div className="wai-grid wai-grid--3">
					<Num
						id="lab-batch"
						label="Batch size"
						suffix="mL"
						value={input.batchMl}
						onChange={(batchMl) => set({ batchMl })}
					/>
					<Num
						id="lab-nic"
						label="Target nicotine"
						suffix="mg/mL"
						value={input.targetNicotineMgPerMl}
						onChange={(targetNicotineMgPerMl) => set({ targetNicotineMgPerMl })}
						help="0 for a nicotine-free batch."
					/>
					<Num
						id="lab-pg"
						label="PG share of all PG and VG"
						suffix="%"
						value={input.targetPgPercent}
						onChange={(targetPgPercent) => set({ targetPgPercent })}
						help="VG is the rest. Carriers count."
					/>
				</div>

				<fieldset className="wai-card" style={{ padding: 14 }}>
					<legend className="wai-label">Nicotine base</legend>
					<div className="wai-grid wai-grid--4">
						<Num
							id="lab-base-strength"
							label="Strength"
							suffix="mg/mL"
							value={input.nicotineBase.strengthMgPerMl}
							onChange={(strengthMgPerMl) => setBase({ strengthMgPerMl })}
						/>
						<Num
							id="lab-base-pg"
							label="PG in it"
							suffix="%"
							value={input.nicotineBase.pgPercent}
							onChange={(pgPercent) => setBase({ pgPercent })}
						/>
						<Num
							id="lab-base-vg"
							label="VG in it"
							suffix="%"
							value={input.nicotineBase.vgPercent}
							onChange={(vgPercent) => setBase({ vgPercent })}
						/>
						<Num
							id="lab-base-density"
							label="Density"
							suffix="g/mL"
							value={input.nicotineBase.density ?? ""}
							onChange={(density) => setBase({ density })}
						/>
					</div>
					<p className="wai-help" style={{ marginBottom: 0 }}>
						Enter the carrier from the supplier’s documentation. A base isn’t assumed to be all PG.
					</p>
				</fieldset>

				<fieldset className="wai-card" style={{ padding: 14 }}>
					<legend className="wai-label">Flavours</legend>
					<div className="wai-stack" style={{ gap: 12 }}>
						{input.flavours.map((flavour, index) => (
							<div
								key={index}
								className="wai-grid"
								style={{ gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))", alignItems: "end" }}
							>
								<div className="wai-field">
									<label htmlFor={`lab-f-${index}-name`}>Flavour {index + 1}</label>
									<input
										id={`lab-f-${index}-name`}
										className="wai-input"
										value={flavour.name}
										onChange={(event) => setFlavour(index, { name: event.target.value })}
										autoComplete="off"
									/>
								</div>
								<Num
									id={`lab-f-${index}-pct`}
									label="Of batch"
									suffix="%"
									value={flavour.percent}
									onChange={(percent) => setFlavour(index, { percent })}
								/>
								<Num
									id={`lab-f-${index}-pg`}
									label="PG in it"
									suffix="%"
									value={flavour.pgPercent}
									onChange={(pgPercent) => setFlavour(index, { pgPercent })}
								/>
								<Num
									id={`lab-f-${index}-vg`}
									label="VG in it"
									suffix="%"
									value={flavour.vgPercent}
									onChange={(vgPercent) => setFlavour(index, { vgPercent })}
								/>
								<Num
									id={`lab-f-${index}-d`}
									label="Density"
									suffix="g/mL"
									value={flavour.density ?? ""}
									onChange={(density) => setFlavour(index, { density })}
								/>
							</div>
						))}
						<div className="wai-row">
							<button
								type="button"
								className="wai-btn wai-btn--small"
								onClick={() => set({ flavours: [...input.flavours, blankFlavour()] })}
								disabled={input.flavours.length >= 8}
							>
								Add a flavour
							</button>
							{input.flavours.length > 1 && (
								<button
									type="button"
									className="wai-btn wai-btn--small wai-btn--quiet"
									onClick={() => set({ flavours: input.flavours.slice(0, -1) })}
								>
									Remove the last one
								</button>
							)}
						</div>
					</div>
				</fieldset>

				<div className="wai-grid wai-grid--2">
					<Num
						id="lab-pg-density"
						label="PG density"
						suffix="g/mL"
						value={input.pgDensity ?? ""}
						onChange={(pgDensity) => set({ pgDensity })}
						help="From the supplier's documentation, at its stated temperature."
					/>
					<Num
						id="lab-vg-density"
						label="VG density"
						suffix="g/mL"
						value={input.vgDensity ?? ""}
						onChange={(vgDensity) => set({ vgDensity })}
						help="Leave blank if you don't have a documented value."
					/>
				</div>
			</div>

			<div className="wai-stack" aria-live="polite">
				{outcome.error ? (
					<div className="wai-notice wai-notice--bad" role="alert">
						<strong>This recipe can’t be calculated.</strong> {outcome.error}
					</div>
				) : outcome.result ? (
					<>
						<div className="wai-table-wrap" role="region" aria-label="Quantities" tabIndex={0}>
							<table className="wai-table">
								<caption>Quantities for this batch. Calculated, not measured.</caption>
								<thead>
									<tr>
										<th scope="col">Ingredient</th>
										<th scope="col" className="wai-num">
											mL
										</th>
										<th scope="col" className="wai-num">
											grams
										</th>
										<th scope="col" className="wai-num">
											% of batch
										</th>
									</tr>
								</thead>
								<tbody>
									{outcome.result.lines.map((line) => (
										<tr key={line.ingredient}>
											<td>
												{line.ingredient}
												<br />
												<span className="wai-muted wai-small">{line.basis}</span>
											</td>
											<td className="wai-num">{line.millilitres}</td>
											<td className="wai-num">{line.grams ?? "unavailable"}</td>
											<td className="wai-num">{line.percentOfBatch}</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
						<dl className="wai-kv">
							<dt>Nominal total volume</dt>
							<dd className="wai-num">{outcome.result.totals.nominalMl} mL</dd>
							<dt>Calculated total weight</dt>
							<dd className="wai-num">
								{outcome.result.totals.grams
									? `${outcome.result.totals.grams} g`
									: "Unavailable: a density is missing"}
							</dd>
							<dt>Calculated nicotine</dt>
							<dd className="wai-num">{outcome.result.totals.calculatedNicotineMgPerMl} mg/mL</dd>
							<dt>Flavour</dt>
							<dd className="wai-num">{outcome.result.totals.flavourPercent} %</dd>
							<dt>PG in the batch</dt>
							<dd className="wai-num">{outcome.result.totals.pgMl} mL</dd>
							<dt>VG in the batch</dt>
							<dd className="wai-num">{outcome.result.totals.vgMl} mL</dd>
							<dt>Neither PG nor VG</dt>
							<dd className="wai-num">{outcome.result.totals.otherMl} mL</dd>
						</dl>
						<ul className="wai-bullets wai-small wai-muted">
							{outcome.result.notes.map((note) => (
								<li key={note}>{note}</li>
							))}
						</ul>
					</>
				) : null}
			</div>
		</div>
	);
}
