import React, { useState, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/db';
import { Transaction } from '../../types';
import { generateId } from '../../utils';
import { parseCSV } from '../../utils/csvParser';
import { Upload, CheckCircle, ArrowRight, Loader2, FileText, Settings, AlertCircle, Save } from 'lucide-react';
import { useScope } from '../../context/ScopeContext';

type ImportStep = 'UPLOAD' | 'MAP' | 'PREVIEW';

export const Importer = () => {
    const { scope } = useScope();
    const accounts = useLiveQuery(() => db.accounts
        .filter(a => a.scope === scope || (scope === 'PERSONAL' && !a.scope))
        .toArray(), [scope]) || [];
    const rules = useLiveQuery(() => db.rules
        .filter(r => r.scope === scope || (scope === 'PERSONAL' && !r.scope))
        .toArray(), [scope]) || [];

    // State
    const [step, setStep] = useState<ImportStep>('UPLOAD');
    const [rawText, setRawText] = useState("");
    const [parsedMatrix, setParsedMatrix] = useState<string[][]>([]);
    const [selectedAccount, setSelectedAccount] = useState<string>("");

    // Mapping State (Column Indices)
    const [mapConfig, setMapConfig] = useState({
        date: -1,
        description: -1,
        amount: -1,
        headerRow: true
    });

    const [previewData, setPreviewData] = useState<Transaction[]>([]);

    // --- Step 1: Upload / Parse ---
    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (evt) => {
            if (evt.target?.result) setRawText(evt.target.result as string);
        };
        reader.readAsText(file);
    };

    const processRawText = () => {
        if (!rawText.trim() || !selectedAccount) return alert("Selecciona cuenta y pega datos");
        const matrix = parseCSV(rawText);
        if (matrix.length === 0) return alert("No se detectaron datos");

        setParsedMatrix(matrix);
        // Auto-guess columns
        const firstRow = matrix[0];
        const dateIdx = firstRow.findIndex(c => c.toLowerCase().includes('date') || c.toLowerCase().includes('fecha'));
        const descIdx = firstRow.findIndex(c => c.toLowerCase().includes('desc') || c.toLowerCase().includes('detalle'));
        const amtIdx = firstRow.findIndex(c => c.toLowerCase().includes('amount') || c.toLowerCase().includes('monto') || c.toLowerCase().includes('saldo'));

        setMapConfig({
            date: dateIdx >= 0 ? dateIdx : 0,
            description: descIdx >= 0 ? descIdx : 1,
            amount: amtIdx >= 0 ? amtIdx : 2,
            headerRow: true
        });

        setStep('MAP');
    };

    // --- Step 2: Map Columns ---
    const generatePreview = () => {
        if (mapConfig.date === -1 || mapConfig.description === -1 || mapConfig.amount === -1) {
            return alert("Por favor asigna todas las columnas clave");
        }

        const rowsToProcess = mapConfig.headerRow ? parsedMatrix.slice(1) : parsedMatrix;

        const mappedTransactions: Transaction[] = rowsToProcess.map(row => {
            // Safe access
            const dateRaw = row[mapConfig.date] || "";
            const descRaw = row[mapConfig.description] || "Sin descripción";
            const amtRaw = row[mapConfig.amount] || "0";

            // Parse Date (Basic ISO support or US/EU formats)
            let dateStr = new Date().toISOString().split('T')[0];
            const dateObj = new Date(dateRaw);
            if (!isNaN(dateObj.getTime())) {
                dateStr = dateObj.toISOString().split('T')[0];
            }

            // Parse Amount (Remove Currency symbols, handle negatives)
            const cleanAmt = amtRaw.replace(/[^0-9.-]/g, '');
            const amount = parseFloat(cleanAmt) || 0;

            // Auto-categorize
            let category = "Uncategorized";
            const matchedRule = rules.find(r =>
                r.active && r.matchType === 'contains' && descRaw.toLowerCase().includes(r.pattern.toLowerCase())
            );
            if (matchedRule) category = matchedRule.category;

            return {
                id: generateId(),
                date: dateStr,
                description_original: descRaw,
                description_normalized: descRaw,
                amount: amount,
                type: (amount >= 0 ? 'INCOME' : 'EXPENSE') as import('../../types').TransactionType,
                category: category,
                account_id: selectedAccount,
                scope: scope, // Assign current scope
                is_duplicate: false,
                needs_review: !matchedRule
            };
        }).filter(t => t.amount !== 0); // Filter empty rows

        setPreviewData(mappedTransactions);
        setStep('PREVIEW');
    };

    // --- Step 3: Save ---
    const handleSave = async () => {
        if (previewData.length === 0) return;
        if (window.confirm(`¿Importar ${previewData.length} transacciones?`)) {
            await db.transactions.bulkAdd(previewData);
            alert("¡Importación exitosa!");
            // Reset
            setStep('UPLOAD');
            setRawText("");
            setParsedMatrix([]);
            setPreviewData([]);
        }
    };

    // --- Renders ---

    return (
        <div className="p-8 max-w-5xl mx-auto animate-in fade-in">
            <header className="mb-8">
                <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-3">
                    <Upload size={32} className="text-indigo-600" /> Importador Universal
                </h1>
                <p className="text-slate-500 mt-2">Carga extractos de cualquier banco. (Soporta CSV, Texto separado por comas, tabs, o punto y coma)</p>

                {/* Stepper */}
                <div className="flex items-center gap-4 mt-6">
                    <StepBadge step="UPLOAD" current={step} number={1} label="Cargar Datos" />
                    <div className="w-8 h-0.5 bg-slate-200"></div>
                    <StepBadge step="MAP" current={step} number={2} label="Mapear Columnas" />
                    <div className="w-8 h-0.5 bg-slate-200"></div>
                    <StepBadge step="PREVIEW" current={step} number={3} label="Confirmar" />
                </div>
            </header>

            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden min-h-[400px] p-6">

                {step === 'UPLOAD' && (
                    <div className="max-w-2xl mx-auto space-y-6">
                        <div>
                            <label className="block text-sm font-bold text-slate-700 mb-2">Cuenta Destino</label>
                            <select
                                className="w-full px-4 py-3 border rounded-xl bg-white focus:ring-2 focus:ring-indigo-500 outline-none"
                                value={selectedAccount}
                                onChange={e => setSelectedAccount(e.target.value)}
                            >
                                <option value="">-- Seleccionar Cuenta --</option>
                                {accounts.map(a => <option key={a.id} value={a.id}>{a.name} ({a.institution})</option>)}
                            </select>
                        </div>

                        <div className="border-2 border-dashed border-slate-300 rounded-xl p-8 text-center bg-slate-50 transition-colors hover:bg-slate-100 hover:border-indigo-400">
                            <FileText className="mx-auto text-slate-400 mb-4" size={48} />
                            <p className="font-medium text-slate-600 mb-2">Arrastra tu archivo CSV aquí o selecciona</p>
                            <input type="file" accept=".csv,.txt" className="hidden" id="file-upload" onChange={handleFileUpload} />
                            <label htmlFor="file-upload" className="inline-block px-4 py-2 bg-white border border-slate-300 rounded-lg text-sm font-bold text-indigo-600 cursor-pointer hover:bg-indigo-50">
                                Explorar Archivos
                            </label>
                        </div>

                        <div className="relative">
                            <div className="absolute inset-0 flex items-center">
                                <div className="w-full border-t border-slate-200"></div>
                            </div>
                            <div className="relative flex justify-center text-sm">
                                <span className="px-2 bg-white text-slate-500">O pega el texto directamente</span>
                            </div>
                        </div>

                        <textarea
                            className="w-full h-32 p-4 border rounded-xl text-xs font-mono focus:ring-2 focus:ring-indigo-500 outline-none"
                            placeholder="Fecha, Detalle, Valor..."
                            value={rawText}
                            onChange={e => setRawText(e.target.value)}
                        />

                        <button
                            onClick={processRawText}
                            disabled={!rawText || !selectedAccount}
                            className="w-full py-3 bg-indigo-600 text-white rounded-xl font-bold shadow-lg shadow-indigo-200 hover:bg-indigo-700 disabled:opacity-50 flex items-center justify-center gap-2"
                        >
                            Siguiente: Mapear Columnas <ArrowRight size={18} />
                        </button>
                    </div>
                )}

                {step === 'MAP' && (
                    <div className="space-y-6">
                        <div className="flex gap-4 p-4 bg-indigo-50 border border-indigo-100 rounded-xl text-sm text-indigo-800">
                            <Settings size={20} />
                            <p>Hemos detectado <b>{parsedMatrix.length}</b> filas y <b>{parsedMatrix[0]?.length}</b> columnas. Por favor indica qué representa cada columna.</p>
                        </div>

                        <div className="grid grid-cols-3 gap-6">
                            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                                <label className="block text-xs font-bold text-slate-500 mb-2 uppercase">Fecha</label>
                                <select className="w-full p-2 border rounded-lg" value={mapConfig.date} onChange={e => setMapConfig({ ...mapConfig, date: parseInt(e.target.value) })}>
                                    {parsedMatrix[0].map((col, idx) => <option key={idx} value={idx}>Columna {idx + 1}: {col.slice(0, 20)}</option>)}
                                </select>
                            </div>
                            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                                <label className="block text-xs font-bold text-slate-500 mb-2 uppercase">Descripción</label>
                                <select className="w-full p-2 border rounded-lg" value={mapConfig.description} onChange={e => setMapConfig({ ...mapConfig, description: parseInt(e.target.value) })}>
                                    {parsedMatrix[0].map((col, idx) => <option key={idx} value={idx}>Columna {idx + 1}: {col.slice(0, 20)}</option>)}
                                </select>
                            </div>
                            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                                <label className="block text-xs font-bold text-slate-500 mb-2 uppercase">Monto / Valor</label>
                                <select className="w-full p-2 border rounded-lg" value={mapConfig.amount} onChange={e => setMapConfig({ ...mapConfig, amount: parseInt(e.target.value) })}>
                                    {parsedMatrix[0].map((col, idx) => <option key={idx} value={idx}>Columna {idx + 1}: {col.slice(0, 20)}</option>)}
                                </select>
                            </div>
                        </div>

                        <div className="flex items-center gap-2 mb-4">
                            <input type="checkbox" id="headerRow" checked={mapConfig.headerRow} onChange={e => setMapConfig({ ...mapConfig, headerRow: e.target.checked })} className="w-4 h-4 text-indigo-600 rounded" />
                            <label htmlFor="headerRow" className="text-sm text-slate-700">La primera fila son encabezados (ignorar)</label>
                        </div>

                        {/* Preview Table of first 5 rows */}
                        <div className="overflow-x-auto border rounded-xl">
                            <table className="w-full text-left text-xs">
                                <thead className="bg-slate-100 font-bold text-slate-500">
                                    <tr>
                                        {parsedMatrix[0].map((_, i) => (
                                            <th key={i} className={`p-3 ${i === mapConfig.date ? 'bg-indigo-100 text-indigo-700 border-b-2 border-indigo-500' : ''} ${i === mapConfig.description ? 'bg-indigo-100 text-indigo-700 border-b-2 border-indigo-500' : ''} ${i === mapConfig.amount ? 'bg-indigo-100 text-indigo-700 border-b-2 border-indigo-500' : ''}`}>
                                                Col {i + 1}
                                                {i === mapConfig.date && " (FECHA)"}
                                                {i === mapConfig.description && " (DESC)"}
                                                {i === mapConfig.amount && " (MONTO)"}
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody className="divide-y">
                                    {parsedMatrix.slice(0, 5).map((row, rIdx) => (
                                        <tr key={rIdx} className={mapConfig.headerRow && rIdx === 0 ? 'opacity-50 bg-slate-50' : ''}>
                                            {row.map((cell, cIdx) => <td key={cIdx} className="p-3 font-mono">{cell}</td>)}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        <div className="flex justify-end gap-2 mt-6">
                            <button onClick={() => setStep('UPLOAD')} className="px-6 py-3 text-slate-500 font-bold hover:bg-slate-100 rounded-xl">Atrás</button>
                            <button onClick={generatePreview} className="px-6 py-3 bg-indigo-600 text-white font-bold rounded-xl shadow-lg shadow-indigo-200 hover:bg-indigo-700">Previsualizar Datos</button>
                        </div>
                    </div>
                )}

                {step === 'PREVIEW' && (
                    <div className="flex flex-col h-[500px]">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="font-bold text-slate-800">Transacciones a Importar ({previewData.length})</h3>
                            <button onClick={handleSave} className="px-6 py-2 bg-emerald-600 text-white font-bold rounded-lg shadow-lg hover:bg-emerald-700 flex items-center gap-2">
                                <Save size={18} /> Confirmar e Importar
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto border rounded-xl">
                            <table className="w-full text-left text-sm">
                                <thead className="bg-slate-50 text-slate-500 sticky top-0">
                                    <tr>
                                        <th className="p-3">Fecha</th>
                                        <th className="p-3">Descripción</th>
                                        <th className="p-3">Categoría (Auto)</th>
                                        <th className="p-3 text-right">Monto</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {previewData.map(t => (
                                        <tr key={t.id} className="hover:bg-slate-50">
                                            <td className="p-3 text-slate-500 font-mono text-xs">{t.date}</td>
                                            <td className="p-3 font-medium text-slate-800">{t.description_original}</td>
                                            <td className="p-3">
                                                <span className={`px-2 py-1 rounded-md text-xs font-bold ${t.category === 'Uncategorized' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600'}`}>
                                                    {t.category}
                                                </span>
                                            </td>
                                            <td className={`p-3 text-right font-mono font-bold ${t.amount > 0 ? 'text-emerald-600' : 'text-slate-800'}`}>
                                                {t.amount}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        <div className="mt-4 flex justify-start">
                            <button onClick={() => setStep('MAP')} className="text-sm text-slate-500 hover:text-slate-800 underline">Corregir Mapeo</button>
                        </div>
                    </div>
                )}

            </div>
        </div>
    );
};

const StepBadge = ({ step, current, number, label }: any) => {
    const isActive = current === step;
    // Rough logic for completed steps would need a proper order check, simplified here
    const isCompleted = (step === 'UPLOAD' && current !== 'UPLOAD') || (step === 'MAP' && current === 'PREVIEW');

    return (
        <div className={`flex items-center gap-2 ${isActive ? 'text-indigo-600' : isCompleted ? 'text-emerald-600' : 'text-slate-400'}`}>
            <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${isActive ? 'bg-indigo-600 text-white' : isCompleted ? 'bg-emerald-100' : 'bg-slate-100'}`}>
                {isCompleted ? <CheckCircle size={16} /> : number}
            </div>
            <span className="font-bold text-sm">{label}</span>
        </div>
    )
}
