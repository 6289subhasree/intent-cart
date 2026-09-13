import { AccountGate } from "@/components/merchant-account";
export default function Layout({ children }: { children: React.ReactNode }) { return <AccountGate>{children}</AccountGate>; }
