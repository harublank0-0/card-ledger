import { Link, useRouterState } from "@tanstack/react-router";
import { cn } from "cn";
import {
	ArrowLeftRight,
	CreditCard,
	FileText,
	LayoutDashboard,
	LogOut,
	type LucideIcon,
	Menu,
	Repeat,
	Settings,
	Tags,
} from "lucide-react";
import { type ReactNode, useState } from "react";

import { Brand } from "#/components/brand";
import { Toaster } from "#/components/toaster";
import { Button } from "#/components/ui/button";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetTitle,
	SheetTrigger,
} from "#/components/ui/sheet";
import { authClient } from "#/lib/auth-client";
import { reloadTo } from "#/lib/session-change";

type NavTarget =
	| "/"
	| "/transactions"
	| "/statements"
	| "/subscriptions"
	| "/cards"
	| "/categories"
	| "/settings";

type NavItem = { to: NavTarget; label: string; icon: LucideIcon };

const PRIMARY: NavItem[] = [
	{ to: "/", label: "Dashboard", icon: LayoutDashboard },
	{ to: "/transactions", label: "Transactions", icon: ArrowLeftRight },
	{ to: "/statements", label: "Statements", icon: FileText },
	{ to: "/subscriptions", label: "Subscriptions", icon: Repeat },
	{ to: "/cards", label: "Cards", icon: CreditCard },
];

const SECONDARY: NavItem[] = [
	{ to: "/categories", label: "Categories", icon: Tags },
	{ to: "/settings", label: "Settings", icon: Settings },
];

const navLinkClass =
	"group flex h-9 items-center gap-3 rounded-lg px-2.5 text-sm font-medium text-sidebar-muted transition-[color,background-color,border-color,text-decoration-color] duration-150 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sidebar-ring data-[status=active]:bg-sidebar-primary data-[status=active]:text-sidebar-primary-foreground data-[status=active]:shadow-[inset_0_1px_0_rgb(255_255_255/0.12)]";

function NavLinks({
	items,
	onNavigate,
}: {
	items: NavItem[];
	onNavigate?: () => void;
}) {
	return (
		<ul className="grid gap-0.5">
			{items.map(({ to, label, icon: Icon }) => (
				<li key={to}>
					<Link
						to={to}
						onClick={onNavigate}
						className={navLinkClass}
						// The dashboard is "/" and its month picker adds ?month=, which must still count.
						activeOptions={
							to === "/" ? { exact: true, includeSearch: false } : undefined
						}
					>
						<Icon
							aria-hidden="true"
							className="size-4 text-sidebar-subtle transition-[color,background-color,border-color,text-decoration-color] group-hover:text-sidebar-accent-foreground group-data-[status=active]:text-sidebar-primary-foreground"
						/>
						{label}
					</Link>
				</li>
			))}
		</ul>
	);
}

function Navigation({ onNavigate }: { onNavigate?: () => void }) {
	return (
		<nav aria-label="Main" className="grid gap-4">
			<NavLinks items={PRIMARY} onNavigate={onNavigate} />
			<div className="border-t border-sidebar-border pt-4">
				<NavLinks items={SECONDARY} onNavigate={onNavigate} />
			</div>
		</nav>
	);
}

function Account({ email }: { email: string }) {
	return (
		<div className="grid gap-1 border-t border-sidebar-border pt-3">
			<div className="px-2.5 pb-1">
				<p className="text-xs text-sidebar-subtle">Signed in as</p>
				<p
					className="truncate text-sm font-medium text-sidebar-foreground"
					title={email}
				>
					{email}
				</p>
			</div>
			<Button
				variant="ghost"
				size="sm"
				className="justify-start gap-3 px-2.5 text-sidebar-muted hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:outline-sidebar-ring"
				onClick={async () => {
					await authClient.signOut();
					reloadTo("/sign-in");
				}}
			>
				<LogOut aria-hidden="true" />
				Sign out
			</Button>
		</div>
	);
}

/** Thin bar at the top of the content while the next screen's data loads. */
function RouteProgress() {
	const loading = useRouterState({ select: (s) => s.status === "pending" });
	return (
		<div
			aria-hidden="true"
			className={cn(
				"pointer-events-none fixed inset-x-0 top-0 z-40 h-0.5 overflow-hidden transition-opacity lg:left-60",
				loading
					? "opacity-100 delay-150 duration-200"
					: "opacity-0 duration-300",
			)}
		>
			<div className="h-full w-full origin-left animate-route-progress bg-primary motion-reduce:animate-none motion-reduce:opacity-60" />
		</div>
	);
}

/**
 * The signed-in frame: a compact sidebar on wide screens, a top bar with a slide-in menu on
 * phones and tablets, and the page in between.
 */
export function AppShell({
	email,
	children,
}: {
	email: string;
	children: ReactNode;
}) {
	const [menuOpen, setMenuOpen] = useState(false);
	const loading = useRouterState({ select: (s) => s.status === "pending" });
	const close = () => setMenuOpen(false);

	return (
		<div className="min-h-screen lg:grid lg:grid-cols-[15rem_minmax(0,1fr)]">
			<a
				href="#main"
				className="sr-only z-50 rounded-lg bg-card px-3 py-2 font-medium shadow-raised focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
			>
				Skip to content
			</a>

			<aside className="hidden bg-sidebar lg:block">
				<div className="sticky top-0 flex h-screen flex-col gap-6 overflow-y-auto px-3 py-5">
					<div className="px-1.5">
						<Brand />
					</div>
					<Navigation />
					<div className="mt-auto">
						<Account email={email} />
					</div>
				</div>
			</aside>

			<div className="min-w-0">
				<header className="sticky top-0 z-30 flex h-14 items-center justify-between bg-sidebar px-4 sm:px-6 lg:hidden">
					<Brand />
					<Sheet open={menuOpen} onOpenChange={setMenuOpen}>
						<SheetTrigger asChild>
							<Button
								variant="ghost"
								size="icon"
								className="-mr-2 text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:outline-sidebar-ring"
							>
								<Menu aria-hidden="true" className="size-5" />
								<span className="sr-only">Open menu</span>
							</Button>
						</SheetTrigger>
						<SheetContent
							side="left"
							className="w-72 gap-6 border-sidebar-border bg-sidebar px-3 py-5 [&_[data-slot=sheet-close]]:text-sidebar-muted [&_[data-slot=sheet-close]:hover]:bg-sidebar-accent [&_[data-slot=sheet-close]:hover]:text-sidebar-accent-foreground"
						>
							<SheetTitle className="sr-only">Menu</SheetTitle>
							<SheetDescription className="sr-only">
								Go to another part of Card Ledger.
							</SheetDescription>
							<div className="px-1.5">
								<Brand onNavigate={close} />
							</div>
							<Navigation onNavigate={close} />
							<div className="mt-auto">
								<Account email={email} />
							</div>
						</SheetContent>
					</Sheet>
				</header>

				<RouteProgress />
				<main
					id="main"
					tabIndex={-1}
					aria-busy={loading || undefined}
					className="mx-auto w-full max-w-[76rem] px-4 pt-6 pb-16 outline-none sm:px-6 lg:px-10 lg:pt-9"
				>
					{children}
				</main>
			</div>
			<Toaster />
		</div>
	);
}
