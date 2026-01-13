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
import { AiAssistant } from './components/ai/AiAssistant';
import { FilterBar } from './components/layout/FilterBar';

// Auth Imports
import { AuthProvider, useAuth } from "./context/AuthContext";
import { LoginScreen } from "./components/auth/LoginScreen";

const AppContent = () => {
    const { user, signInWithGoogle, loading } = useAuth();
    // const user = { uid: "debug-mode" }; // MOCK USER TO BYPASS AUTH
    // const loading = false;
    const [view, setView] = useState<"dashboard" | "transactions" | "import" | "settings" | "planning" | "budget" | "cashflow" | "investment">("dashboard");
    const [settingsTab, setSettingsTab] = useState<"accounts" | "categories" | "rules" | "recurring" | "closing">("accounts");

    if (loading) {
        return (
            <div className="min-h-screen bg-slate-900 flex items-center justify-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-500"></div>
            </div>
        );
    }

    if (!user) {
        return <LoginScreen onLogin={signInWithGoogle} />;
    }

    const navigateToSettings = (tab: "accounts" | "categories" | "rules" | "recurring" | "closing") => {
        setSettingsTab(tab);
        setView("settings");
    };

    const handleNavigation = (destination: string) => {
        if (destination.startsWith("settings:")) {
            const tab = destination.split(":")[1] as any;
            navigateToSettings(tab);
        } else {
            setView(destination as any);
        }
    };

    return (
        <div className="flex h-screen bg-slate-50 font-sans text-slate-900">
            <Sidebar currentView={view} onNavigate={handleNavigation} />

            {/* Main Content */}
            <main className="flex-1 overflow-auto bg-slate-50/50">
                <div className="h-full flex flex-col">
                    {/* Global Filter Bar - Visible in data-centric views */}
                    {['dashboard', 'transactions', 'budget', 'planning', 'cashflow'].includes(view) && (
                        <FilterBar />
                    )}

                    <div className="max-w-7xl mx-auto w-full p-8 pt-4">
                        {view === "dashboard" && <Dashboard onNavigate={handleNavigation} />}
                        {view === "transactions" && <Transactions />}
                        {view === "import" && <Importer />}
                        {view === "settings" && <SettingsManager initialTab={settingsTab} />}
                        {view === "planning" && <PlanningModule onNavigate={handleNavigation} />}
                        {view === "cashflow" && <CashflowCalendar />}
                        {view === "investment" && <InvestmentSimulator />}
                        {view === "budget" && (
                            <BudgetModule onNavigateToSettings={() => navigateToSettings("categories")} />
                        )}
                    </div>
                </div>
            </main>
            <AiAssistant />
        </div>
    );
};

export const App = () => (
    <AuthProvider>
        <AppContent />
    </AuthProvider>
);
