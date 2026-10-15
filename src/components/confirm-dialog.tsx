import { LoaderCircle } from "lucide-react";
import { type ReactNode, useState } from "react";

import {
	AlertDialog,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from "#/components/ui/alert-dialog";
import { Button } from "#/components/ui/button";

/**
 * Asks before something permanent. The dialog stays open while the action runs and closes
 * when it settles; a failure is shown by the page (through `useAction`), not in the dialog.
 */
export function ConfirmDialog({
	trigger,
	title,
	description,
	confirmLabel,
	cancelLabel = "Keep it",
	pending,
	onConfirm,
}: {
	trigger: ReactNode;
	title: string;
	description: ReactNode;
	confirmLabel: string;
	cancelLabel?: string;
	pending: boolean;
	onConfirm: () => Promise<unknown>;
}) {
	const [open, setOpen] = useState(false);
	return (
		<AlertDialog open={open} onOpenChange={(next) => !pending && setOpen(next)}>
			<AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>{title}</AlertDialogTitle>
					<AlertDialogDescription>{description}</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel disabled={pending}>
						{cancelLabel}
					</AlertDialogCancel>
					<Button
						variant="destructive"
						disabled={pending}
						onClick={async () => {
							await onConfirm();
							setOpen(false);
						}}
					>
						{pending && (
							<LoaderCircle aria-hidden="true" className="animate-spin" />
						)}
						{confirmLabel}
					</Button>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
