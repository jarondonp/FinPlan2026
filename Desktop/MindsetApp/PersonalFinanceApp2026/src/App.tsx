import React, { useState } from "react";
import { Sidebar } from "./components/layout/Sidebar";
import { Dashboard } from "./components/dashboard/Dashboard";
import { BudgetModule } from "./components/budget/BudgetModule";
import { PlanningModule } from "./components/planning/PlanningModule";
import { Transactions } from "./components/transactions/Transactions";
import { Importer } from "./components/importer/Importer";
import { SettingsManager } from "./components/settings/SettingsManager";
import { CashflowCalendar } from './components/planning/CashflowCalendar';
import { InvestmentSimulator } from './components/planning/InvestmentSimulator';

export const App = () => {
    const [view, setView] = useState<"dashboard" | "transactions" | "import" | "settings" | "planning" | "budget" | "cashflow" | "investment">("dashboard");
    const [settingsTab, setSettingsTab] = useState<"accounts" | "categories" | "rules">("accounts");

    const navigateToSettings = (tab: "accounts" | "categories" | "rules") => {
        setSettingsTab(tab);
        setView("settings");
    };

    return (
        <div className="flex h-screen bg-slate-50 font-sans text-slate-900">
            <Sidebar currentView={view} onNavigate={(v) => setView(v as any)} />

            {/* Main Content */}
            <main className="flex-1 overflow-auto bg-slate-50/50">
                <div className="max-w-7xl mx-auto h-full flex flex-col">
                    {view === "dashboard" && <Dashboard onNavigate={(v) => setView(v as any)} />}
                    {view === "transactions" && <Transactions />}
                    {view === "import" && <Importer />}
                    {view === "settings" && <SettingsManager initialTab={settingsTab} />}
                    {view === "planning" && <PlanningModule onNavigate={(v) => setView(v as any)} />}
                    {view === "cashflow" && <CashflowCalendar />}
                    {view === "investment" && <InvestmentSimulator />}
                    {view === "budget" && (
                        <BudgetModule onNavigateToSettings={() => navigateToSettings("categories")} />
                    )}
                </div>
            </main>
        </div>
    );
};
