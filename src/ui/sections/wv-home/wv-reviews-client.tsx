"use client";

import { Package, PenLine, Pencil, Star, Trash2 } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useState, useTransition } from "react";
import { deleteReview, saveReview } from "@/lib/wv-review-actions";
import { type Review, type ReviewableProduct } from "@/lib/reviews";
import { ConfirmDelete } from "./wv-confirm-delete";

const bungee = "font-[family-name:var(--font-bungee)]";
const orbitron = "font-[family-name:var(--font-orbitron)]";
const heyComic = "font-[family-name:var(--font-hey-comic)]";

/** A text field set into the glass, glowing cyan while focused (`.wv-acct-field` in wv-home.css). */
const field = `${orbitron} wv-acct-field w-full min-w-0 rounded-lg px-3 py-2.5 text-xs text-white placeholder:text-[var(--ac-muted)]/60 focus:outline-none`;

/** A rating as five stars, those it earns lit and glowing cyan (`.wv-review-stars`). */
function StarRow({ rating }: { rating: number }) {
	return (
		<span role="img" aria-label={`${rating} out of 5 stars`} className="wv-review-stars flex gap-1">
			{[1, 2, 3, 4, 5].map((n) => (
				<Star key={n} aria-hidden data-on={n <= rating || undefined} className="size-4" strokeWidth={2} />
			))}
		</span>
	);
}

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
			{/* The stars to pick: lit and glowing up to the one chosen, each lifting under the pointer. */}
			<div
				role="radiogroup"
				aria-label="Rating"
				className="wv-review-stars wv-review-stars--pick flex gap-1.5"
			>
				{[1, 2, 3, 4, 5].map((n) => (
					<button
						key={n}
						type="button"
						role="radio"
						aria-checked={rating === n}
						aria-label={`${n} star${n > 1 ? "s" : ""}`}
						onClick={() => setRating(n)}
						className="rounded-md p-0.5"
					>
						<Star aria-hidden data-on={n <= rating || undefined} className="size-7" strokeWidth={1.75} />
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
					className={`${heyComic} wv-pc-cta h-10 rounded-[10px] bg-[var(--ac-cyan-bright)] px-6 text-xs text-[var(--ac-input)] disabled:opacity-60`}
				>
					<span className="wv-pc-cta-label">{pending ? "SAVING…" : "SAVE REVIEW"}</span>
				</button>
				<button
					type="button"
					onClick={onDone}
					className={`${heyComic} wv-btn wv-btn-outline wv-btn-neon h-10 rounded-[10px] border border-[var(--ac-cyan)] px-6 text-xs text-[var(--ac-cyan)]`}
				>
					<span className="wv-btn-label">CANCEL</span>
				</button>
			</div>
		</div>
	);
}

/** A review's (or a product to review's) row: glass inside a soft neon edge (`.wv-order-line`, as on an order's page). */
const card = "wv-order-line flex flex-col gap-3 rounded-xl p-4 md:p-5";

export function ReviewCard({ review }: { review: Review }) {
	const [editing, setEditing] = useState(false);
	const [confirming, setConfirming] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [pending, start] = useTransition();

	const remove = () =>
		start(async () => {
			const r = await deleteReview(review.id);
			if (!r.ok) {
				setError(r.error);
				setConfirming(false);
			}
		});

	return (
		<article className={card}>
			<h2 className={`${bungee} wv-pc-name text-base uppercase text-white md:text-[19px]`}>
				<Link href={`/product/${review.productSlug}`} className="wv-review-product">
					{review.productName}
				</Link>
			</h2>
			{editing ? (
				<Editor productId={review.productId} initial={review} onDone={() => setEditing(false)} />
			) : (
				<>
					<StarRow rating={review.rating} />
					<p className={`${orbitron} wv-review-headline text-xs uppercase`}>{review.headline}</p>
					<p className={`${orbitron} whitespace-pre-line break-words text-xs text-[var(--ac-muted)]`}>
						{review.body}
					</p>
					{error && (
						<p role="alert" className="text-xs text-[var(--q-red)]">
							{error}
						</p>
					)}
					{/* Edit and delete as small neon pills, delete in pink; delete asks first, in the card. */}
					<div className={`${orbitron} mt-1 flex flex-wrap gap-2 text-[11px]`}>
						{confirming ? (
							<ConfirmDelete
								question="DELETE THIS REVIEW?"
								pending={pending}
								onConfirm={remove}
								onCancel={() => setConfirming(false)}
							/>
						) : (
							<>
								<button
									type="button"
									onClick={() => setEditing(true)}
									className="wv-review-btn flex items-center gap-1.5 rounded-full px-3 py-1"
								>
									<Pencil aria-hidden className="size-3" strokeWidth={2.5} />
									EDIT
								</button>
								<button
									type="button"
									onClick={() => {
										setError(null);
										setConfirming(true);
									}}
									className="wv-review-btn wv-review-btn--pink flex items-center gap-1.5 rounded-full px-3 py-1"
								>
									<Trash2 aria-hidden className="size-3" strokeWidth={2.5} />
									DELETE
								</button>
							</>
						)}
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
				<div className="wv-order-thumb relative flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-lg">
					{product.image ? (
						<Image
							src={product.image.url}
							alt={product.image.alt}
							fill
							unoptimized
							sizes="48px"
							className="object-cover"
						/>
					) : (
						<Package aria-hidden className="wv-order-thumb-icon size-5" strokeWidth={1.75} />
					)}
				</div>
				<h3 className={`${bungee} wv-pc-name min-w-0 flex-1 break-words text-sm uppercase text-white`}>
					{product.name}
				</h3>
				{!open && (
					<button
						type="button"
						onClick={() => setOpen(true)}
						className={`${heyComic} wv-btn wv-btn-outline wv-btn-neon flex h-10 shrink-0 items-center gap-2 rounded-[10px] border border-[var(--ac-cyan)] px-4 text-xs text-[var(--ac-cyan)]`}
					>
						<PenLine aria-hidden className="size-3.5" strokeWidth={2.5} />
						<span className="wv-btn-label">WRITE REVIEW</span>
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
