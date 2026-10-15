import type { ReactNode } from "react";

/**
 * One block of the settings page: what it is about on the left, the controls on the right.
 * Stacks on narrow screens.
 */
export function SettingsSection({
	id,
	title,
	description,
	children,
}: {
	id: string;
	title: string;
	description: ReactNode;
	children: ReactNode;
}) {
	return (
		<section
			aria-labelledby={id}
			className="grid gap-4 border-t pt-8 first:border-t-0 first:pt-0 md:grid-cols-[15rem_minmax(0,1fr)] md:gap-10"
		>
			<div>
				<h2 id={id} className="text-[15px] font-semibold">
					{title}
				</h2>
				<p className="mt-1 text-sm text-muted-foreground">{description}</p>
			</div>
			<div className="min-w-0">{children}</div>
		</section>
	);
}
