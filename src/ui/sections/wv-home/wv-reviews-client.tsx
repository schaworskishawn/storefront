"use client";

import Image from "next/image";
import Link from "next/link";
import { useState, useTransition } from "react";
import { deleteReview, saveReview } from "@/lib/wv-review-actions";
import { stars, type Review, type ReviewableProduct } from "@/lib/reviews";

const bungee = "font-[family-name:var(--font-bungee)]";
const orbitron = "font-[family-name:var(--font-orbitron)]";
const heyComic = "font-[family-name:var(--font-hey-comic)]";

const field = `${orbitron} w-full min-w-0 rounded-lg border border-[var(--ac-subtle)] bg-[var(--ac-input)] px-3 py-2.5 text-xs text-white placeholder:text-[var(--ac-muted)]/60 focus:border-[var(--ac-cyan)] focus:outline-none`;

function Editor({ productId, initial, onDone }: { productId: string; initial?: Review; onDone: () => void }) {
	const [rating, setRating] = useState(initial?.rating ?? 0);
	const [headline, setHeadline] = useState(initial?.headline ?? "");
	const [body, setBody] = useState(initial?.body ?? "");
	const [error, setError] = useState<string | null>(null);
	const [pending, start] = useTransition();

	const submit = () =>
		start(async () => {
			setError(null);
			const r = await saveReview({ productId, rating, headline, body });
			if (r.ok) onDone();
			else setError(r.error);
		});

	return (
		<div className="flex flex-col gap-3">
			<div role="radiogroup" aria-label="Rating" className="flex gap-1">
				{[1, 2, 3, 4, 5].map((n) => (
					<button
						key={n}
						type="button"
						role="radio"
						aria-checked={rating === n}
						aria-label={`${n} star${n > 1 ? "s" : ""}`}
						onClick={() => setRating(n)}
						className={`text-2xl leading-none ${n <= rating ? "text-[var(--ac-cyan)]" : "text-[var(--ac-muted)]/40"}`}
					>
						★
					</button>
				))}
			</div>
			<input
				value={headline}
				onChange={(e) => setHeadline(e.target.value)}
				maxLength={100}
				placeholder="Headline"
				aria-label="Headline"
				className={field}
			/>
			<textarea
				value={body}
				onChange={(e) => setBody(e.target.value)}
				maxLength={1500}
				rows={4}
				placeholder="Share what you thought of this product"
				aria-label="Review"
				className={`${field} resize-y`}
			/>
			{error && (
				<p role="alert" className="text-xs text-[var(--q-red)]">
					{error}
				</p>
			)}
			<div className="flex gap-2">
				<button
					type="button"
					onClick={submit}
					disabled={pending}
					className={`${heyComic} h-10 rounded-[10px] bg-[var(--ac-cyan-bright)] px-6 text-xs text-[var(--ac-input)] disabled:opacity-60`}
				>
					{pending ? "SAVING…" : "SAVE REVIEW"}
				</button>
				<button
					type="button"
					onClick={onDone}
					className={`${heyComic} h-10 rounded-[10px] border border-[var(--ac-cyan)] px-6 text-xs text-[var(--ac-cyan)]`}
				>
					CANCEL
				</button>
			</div>
		</div>
	);
}

const card =
	"flex flex-col gap-3 rounded-xl border border-[var(--ac-card-border)] bg-[var(--wv-surface)] p-4 md:p-5";

export function ReviewCard({ review }: { review: Review }) {
	const [editing, setEditing] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [pending, start] = useTransition();

	const remove = () => {
		if (!window.confirm("Delete this review?")) return;
		start(async () => {
			const r = await deleteReview(review.id);
			if (!r.ok) setError(r.error);
		});
	};

	return (
		<article className={card}>
			<h2 className={`${bungee} text-base uppercase text-white md:text-[19px]`}>
				<Link href={`/product/${review.productSlug}`}>{review.productName}</Link>
			</h2>
			{editing ? (
				<Editor productId={review.productId} initial={review} onDone={() => setEditing(false)} />
			) : (
				<>
					<p
						aria-label={`${review.rating} out of 5 stars`}
						className={`${orbitron} text-xs text-[var(--ac-muted)]`}
					>
						{stars(review.rating)}
					</p>
					<p className={`${orbitron} text-xs uppercase text-[var(--ac-muted)]`}>{review.headline}</p>
					<p className={`${orbitron} whitespace-pre-line break-words text-xs text-[var(--ac-muted)]`}>
						{review.body}
					</p>
					{error && (
						<p role="alert" className="text-xs text-[var(--q-red)]">
							{error}
						</p>
					)}
					<div className={`${orbitron} mt-2 flex gap-2 text-[11px] text-[var(--ac-pink)]`}>
						<button type="button" onClick={() => setEditing(true)}>
							EDIT
						</button>
						<span aria-hidden>·</span>
						<button type="button" onClick={remove} disabled={pending}>
							{pending ? "DELETING…" : "DELETE"}
						</button>
					</div>
				</>
			)}
		</article>
	);
}

export function PendingReview({ product }: { product: ReviewableProduct }) {
	const [open, setOpen] = useState(false);
	return (
		<article className={card}>
			<div className="flex items-center gap-3">
				<div className="relative size-12 shrink-0 overflow-hidden rounded-lg border border-[var(--ac-card-border)] bg-[var(--ac-subtle)]">
					{product.image && (
						<Image
							src={product.image.url}
							alt={product.image.alt}
							fill
							unoptimized
							sizes="48px"
							className="object-cover"
						/>
					)}
				</div>
				<h3 className={`${bungee} min-w-0 flex-1 break-words text-sm uppercase text-white`}>
					{product.name}
				</h3>
				{!open && (
					<button
						type="button"
						onClick={() => setOpen(true)}
						className={`${heyComic} h-10 shrink-0 rounded-[10px] border border-[var(--ac-cyan)] px-4 text-xs text-[var(--ac-cyan)]`}
					>
						WRITE REVIEW
					</button>
				)}
			</div>
			{open && (
				<div className="wv-unfold">
					<Editor productId={product.id} onDone={() => setOpen(false)} />
				</div>
			)}
		</article>
	);
}
