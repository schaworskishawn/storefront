/** Key in a form's error map for a problem that belongs to the whole form rather than one input. */
export const FORM_ERROR_KEY = "form";

type FieldError = {
	field?: string | null;
	message?: string | null;
	code?: string | null;
};

type Params = {
	fieldErrors: ReadonlyArray<FieldError>;
	/** Names of the inputs the form actually renders. An error for any other field has nowhere to show. */
	knownFields: ReadonlyArray<string>;
	/** Used when Saleor sends an error with no message. */
	fallbackMessage: string;
	/** Replaces Saleor's wording for a given error code, e.g. INSUFFICIENT_STOCK. */
	messageByCode?: Partial<Record<string, string>>;
};

/**
 * Turns Saleor's field errors into the form's error map. An error for a field the form shows lands on that input; any other
 * error (Saleor reports a stock problem on `quantity`, for instance, which the address form has no input for) lands under
 * `FORM_ERROR_KEY` so it can be shown as a message instead of being dropped — dropped errors leave the shopper clicking a
 * button that appears to do nothing.
 */
export function mapCheckoutFieldErrors({
	fieldErrors,
	knownFields,
	fallbackMessage,
	messageByCode = {},
}: Params): Record<string, string> {
	const errors: Record<string, string> = {};

	for (const error of fieldErrors) {
		const message = (error.code && messageByCode[error.code]) || error.message || fallbackMessage;
		const key = error.field && knownFields.includes(error.field) ? error.field : FORM_ERROR_KEY;
		errors[key] ??= message;
	}

	return errors;
}
