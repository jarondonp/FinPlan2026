import React, { useState, useEffect } from "react";
import { Wallet, Tag, BrainCircuit, Calendar, Lock, Cloud, Download } from "lucide-react";
import { AccountManager } from "./AccountManager";
import { CategoryManager } from "./CategoryManager";
import { RuleManager } from "./RuleManager";
import { RecurringManager } from "./RecurringManager";
import { ClosingManager } from "../closing/ClosingManager";
import { DataMigration } from "./DataMigration";
import { BackupManager } from "./BackupManager";

interface SettingsManagerProps {
    initialTab?: "accounts" | "categories" | "rules" | "recurring" | "closing" | "migration" | "backup";
}

export const SettingsManager = ({ initialTab }: SettingsManagerProps) => {
    const [activeTab, setActiveTab] = useState<"accounts" | "categories" | "rules" | "recurring" | "closing" | "migration" | "backup">(initialTab || "accounts");

    useEffect(() => {
        if (initialTab) setActiveTab(initialTab);
    }, [initialTab]);

    return (
        <div className="p-8 max-w-6xl mx-auto animate-in fade-in">
            <h1 className="text-2xl font-bold text-slate-900 mb-2">Configuración</h1>
            <p className="text-slate-500 mb-8">Configura tu perfil financiero para habilitar los módulos avanzados.</p>

            {/* Tabs */}
            <div className="flex gap-4 mb-8 border-b border-slate-200 overflow-x-auto pb-1">
                <TabButton label="Mis Cuentas y Deudas" icon={<Wallet size={16} />} active={activeTab === "accounts"} onClick={() => setActiveTab("accounts")} />
                <TabButton label="Cierre Mensual" icon={<Lock size={16} />} active={activeTab === "closing"} onClick={() => setActiveTab("closing")} />
                <TabButton label="Ingresos y Recurrentes" icon={<Calendar size={16} />} active={activeTab === "recurring"} onClick={() => setActiveTab("recurring")} />
                <TabButton label="Categorías y Presupuesto" icon={<Tag size={16} />} active={activeTab === "categories"} onClick={() => setActiveTab("categories")} />
                <TabButton label="Reglas Automáticas" icon={<BrainCircuit size={16} />} active={activeTab === "rules"} onClick={() => setActiveTab("rules")} />

                {/* Herramientas de Datos */}
                <div className="w-px bg-slate-300 mx-1"></div>
                <TabButton label="Respaldos" icon={<Download size={16} />} active={activeTab === "backup"} onClick={() => setActiveTab("backup")} />
                <TabButton label="Migración Nube" icon={<Cloud size={16} />} active={activeTab === "migration"} onClick={() => setActiveTab("migration")} />
            </div>

            {activeTab === "accounts" && <AccountManager />}
            {activeTab === "closing" && <ClosingManager />}
            {activeTab === "recurring" && <RecurringManager />}
            {activeTab === "categories" && <CategoryManager />}
            {activeTab === "rules" && <RuleManager />}
            {activeTab === "backup" && <BackupManager />}
            {activeTab === "migration" && <DataMigration />}
        </div>
    );
};

const TabButton = ({ label, icon, active, onClick }: any) => (
    <button
        onClick={onClick}
        className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${active
            ? "border-indigo-600 text-indigo-600"
            : "border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300"
            }`}
    >
        {icon}
        <span>{label}</span>
    </button>
);
