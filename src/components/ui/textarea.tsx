import { cn } from "cn";
import type * as React from "react";

import { fieldClasses } from "./input";

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
	return (
		<textarea
			data-slot="textarea"
			className={cn(
				fieldClasses,
				"flex field-sizing-content min-h-20 w-full px-3 py-2",
				className,
			)}
			{...props}
		/>
	);
}

export { Textarea };
