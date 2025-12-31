import React, { useState, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/db';
import { Transaction } from '../../types';
import { generateId, formatMonth } from '../../utils';
import { parseCSV } from '../../utils/csvParser';
import { Upload, CheckCircle, ArrowRight, Loader2, FileText, Settings, AlertCircle, Save } from 'lucide-react';
import { useScope } from '../../context/GlobalFilterContext';

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

    // Global override for Year
    const [importYear, setImportYear] = useState<number>(new Date().getFullYear());

    // Mapping State (Column Indices)
    const [mapConfig, setMapConfig] = useState({
        date: -1,
        description: -1,
        amount: -1,
        headerRow: true,
        invertSign: false // New config option
    });

    const [previewData, setPreviewData] = useState<Transaction[]>([]);

    // --- Filter & Selection State (New) ---
    const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());
    const [activeMonthFilter, setActiveMonthFilter] = useState<string>('ALL');

    // Auto-select all on data load
    React.useEffect(() => {
        if (previewData.length > 0) {
            setSelectedIndices(new Set(previewData.map((_, i) => i)));
        }
    }, [previewData]);

    // Derived: Group by Month
    const monthsInImport = React.useMemo(() => {
        const counts: Record<string, number> = {};
        previewData.forEach(t => {
            const m = t.date.slice(0, 7); // YYYY-MM
            counts[m] = (counts[m] || 0) + 1;
        });
        return Object.entries(counts).sort((a, b) => b[0].localeCompare(a[0])); // Descending
    }, [previewData]);

    const toggleSelection = (index: number) => {
        const newSet = new Set(selectedIndices);
        if (newSet.has(index)) newSet.delete(index);
        else newSet.add(index);
        setSelectedIndices(newSet);
    };

    // --- Step 1: Upload / Parse ---
    const [isAnalyzing, setIsAnalyzing] = useState(false); // New state

    // --- Step 1: Upload / Parse ---
    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        // Check if image
        if (file.type.startsWith('image/')) {
            setIsAnalyzing(true);
            const reader = new FileReader();
            reader.onload = async (evt) => {
                const base64 = evt.target?.result as string;
                if (!base64) return;

                try {
                    const aiService = await import('../../services/aiService').then(m => m.aiService);
                    const matrix = await aiService.extractTransactionsFromImage(base64);

                    if (matrix && matrix.length > 0) {
                        setParsedMatrix(matrix);
                        // Auto-guess columns (simplified for AI output which is standard)
                        setMapConfig({
                            date: 0,
                            description: 1,
                            amount: 2,
                            headerRow: false, // AI usually returns just data, but we can verify. Usually headers are stripped by prompt.
                            invertSign: false
                        });
                        setStep('MAP');
                    } else {
                        alert("No se pudieron extraer datos de la imagen.");
                    }
                } catch (err) {
                    console.error(err);
                    alert("Error analizando imagen con IA. Revisa tu consola.");
                } finally {
                    setIsAnalyzing(false);
                }
            };
            reader.readAsDataURL(file);
        } else {
            // Text/CSV Fallback
            const reader = new FileReader();
            reader.onload = (evt) => {
                if (evt.target?.result) setRawText(evt.target.result as string);
            };
            reader.readAsText(file);
        }
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
            headerRow: true,
            invertSign: false
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

            // Parse Date
            let dateStr = new Date().toISOString().split('T')[0];
            const dateObj = new Date(dateRaw);
            if (!isNaN(dateObj.getTime())) {
                // Force selected year for better consistency
                dateObj.setFullYear(importYear);
                dateStr = dateObj.toISOString().split('T')[0];
            }

            // Parse Amount (Remove Currency symbols, handle negatives)
            const cleanAmt = amtRaw.replace(/[^0-9.-]/g, '');
            let amount = parseFloat(cleanAmt) || 0;

            // Invert Sign Logic
            if (mapConfig.invertSign) {
                amount = -amount;
            }

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
                type: (amount > 0 ? 'INCOME' : 'EXPENSE') as import('../../types').TransactionType,
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
        // Filter only selected
        const transactionsToSave = previewData.filter((_, i) => selectedIndices.has(i));

        if (transactionsToSave.length === 0) return alert("No has seleccionado ninguna transacción para importar.");

        // Validation: Check for Closed Months
        const uniqueMonths = new Set(transactionsToSave.map(t => t.date.slice(0, 7))); // YYYY-MM

        try {
            const statusChecks = Array.from(uniqueMonths).map(async (mKey) => {
                const [y, m] = mKey.split('-').map(Number);
                const d = new Date(y, m - 1, 1);
                // Dynamic import to avoid circular dependency issues if any
                const status = await import('../../services/ClosingService').then(mod => mod.closingService.getStatus(d, scope));
                return { mKey, status };
            });

            const results = await Promise.all(statusChecks);
            const closed = results.find(r => r.status === 'CLOSED' || r.status === 'LOCKED');

            if (closed) {
                alert(`Error de Integridad:\n\nNo puedes importar transacciones para ${closed.mKey} porque ese mes está CERRADO.\n\nPor favor desmarca esas filas o reabre el mes primero.`);
                return;
            }

        } catch (e) {
            console.error(e);
            alert("Error validando estado del mes.");
            return;
        }

        if (window.confirm(`¿Importar ${transactionsToSave.length} transacciones seleccionadas?`)) {
            await db.transactions.bulkAdd(transactionsToSave);
            alert("¡Importación exitosa!");
            // Reset
            setStep('UPLOAD');
            setRawText("");
            setParsedMatrix([]);
            setPreviewData([]);
            setSelectedIndices(new Set());
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
                            <p className="font-medium text-slate-600 mb-2">Arrastra tu archivo (CSV, Texto o <b>Imagen</b>)</p>
                            <input type="file" accept=".csv,.txt,.jpg,.jpeg,.png,.webp" className="hidden" id="file-upload" onChange={handleFileUpload} />
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
                            disabled={!rawText || !selectedAccount || isAnalyzing}
                            className="w-full py-3 bg-indigo-600 text-white rounded-xl font-bold shadow-lg shadow-indigo-200 hover:bg-indigo-700 disabled:opacity-50 flex items-center justify-center gap-2"
                        >
                            {isAnalyzing ? (
                                <>
                                    <Loader2 size={18} className="animate-spin" /> Analizando Imagen (IA)...
                                </>
                            ) : (
                                <>Siguiente: Mapear Columnas <ArrowRight size={18} /></>
                            )}
                        </button>
                    </div>
                )}

                {step === 'MAP' && (
                    <div className="space-y-6">
                        <div className="flex gap-4 p-4 bg-indigo-50 border border-indigo-100 rounded-xl text-sm text-indigo-800 items-center justify-between">
                            <div className="flex items-center gap-2">
                                <Settings size={20} />
                                <p>Hemos detectado <b>{parsedMatrix.length}</b> filas.</p>
                            </div>

                            <div className="flex items-center gap-2">
                                <span className="font-bold text-slate-600">Año para fechas incompletas:</span>
                                <select
                                    className="p-2 border border-indigo-200 rounded-lg bg-white font-bold text-indigo-700"
                                    value={importYear}
                                    onChange={(e) => setImportYear(parseInt(e.target.value))}
                                >
                                    {Array.from({ length: 5 }).map((_, i) => {
                                        const y = new Date().getFullYear() - 2 + i; // 2023 to 2027
                                        return <option key={y} value={y}>{y}</option>
                                    })}
                                </select>
                            </div>
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



                        <div className="flex items-center gap-6 mb-4 p-4 bg-slate-50 rounded-xl border border-slate-200">
                            <div className="flex items-center gap-2">
                                <input
                                    type="checkbox"
                                    id="headerRow"
                                    checked={mapConfig.headerRow}
                                    onChange={e => setMapConfig({ ...mapConfig, headerRow: e.target.checked })}
                                    className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500"
                                />
                                <label htmlFor="headerRow" className="text-sm font-medium text-slate-700 cursor-pointer">Ignorar primera fila (Encabezados)</label>
                            </div>

                            <div className="flex items-center gap-2 ml-auto">
                                <input
                                    type="checkbox"
                                    id="invertSign"
                                    checked={mapConfig.invertSign}
                                    onChange={e => setMapConfig({ ...mapConfig, invertSign: e.target.checked })}
                                    className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500"
                                />
                                <label htmlFor="invertSign" className="text-sm font-bold text-slate-700 cursor-pointer flex items-center gap-1">
                                    Invertir Signos <span className="text-xs font-normal text-slate-500">(Útil para Tarjetas de Crédito)</span>
                                </label>
                            </div>
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
                    </div >
                )}

                {
                    step === 'PREVIEW' && (
                        <div className="flex flex-col h-[600px] p-6">
                            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
                                <div>
                                    <h3 className="font-bold text-slate-800 text-lg">Confirmar Transacciones</h3>
                                    <p className="text-xs text-slate-500">Filtrando: {selectedIndices.size} seleccionadas de {previewData.length} encontradas</p>
                                </div>

                                <div className="flex items-center gap-3">
                                    {/* Month Chips */}
                                    <div className="flex gap-2 bg-slate-100 p-1 rounded-lg">
                                        <button
                                            onClick={() => setActiveMonthFilter('ALL')}
                                            className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all ${activeMonthFilter === 'ALL' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:bg-slate-200'}`}
                                        >
                                            Ver Todo
                                        </button>
                                        {monthsInImport.map(([m, count]) => (
                                            <button
                                                key={m}
                                                onClick={() => setActiveMonthFilter(m)}
                                                className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all flex items-center gap-2 ${activeMonthFilter === m ? 'bg-white text-indigo-700 shadow-sm border border-indigo-100' : 'text-slate-500 hover:bg-slate-200'}`}
                                            >
                                                {formatMonth(new Date(m + "-02"))}
                                                <span className="bg-slate-200 text-slate-600 px-1.5 rounded text-[10px]">{count}</span>
                                            </button>
                                        ))}
                                    </div>

                                    <button onClick={handleSave} disabled={selectedIndices.size === 0} className="px-6 py-2 bg-emerald-600 text-white font-bold rounded-lg shadow-lg hover:bg-emerald-700 flex items-center gap-2 disabled:opacity-50 disabled:grayscale transition-all">
                                        <Save size={18} /> Importar ({selectedIndices.size})
                                    </button>
                                </div>
                            </div>

                            <div className="flex-1 overflow-y-auto border border-slate-200 rounded-xl bg-slate-50/50">
                                <table className="w-full text-left text-sm">
                                    <thead className="bg-slate-50 text-slate-500 sticky top-0 z-10 border-b border-slate-200 uppercase text-xs font-bold tracking-wider">
                                        <tr>
                                            <th className="px-4 py-3 w-12 text-center">
                                                {/* Master Checkbox logic complicated by filters, keeping simple for now */}
                                                #
                                            </th>
                                            <th className="px-4 py-3">Fecha</th>
                                            <th className="px-4 py-3">Descripción</th>
                                            <th className="px-4 py-3">Categoría</th>
                                            <th className="px-4 py-3 text-right">Monto</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100 bg-white">
                                        {previewData.map((t, idx) => {
                                            // 1. Filter Check
                                            const monthKey = t.date.slice(0, 7);
                                            if (activeMonthFilter !== 'ALL' && monthKey !== activeMonthFilter) return null;

                                            const isSelected = selectedIndices.has(idx);

                                            return (
                                                <tr key={idx} className={`group transition-colors ${isSelected ? 'hover:bg-indigo-50/30' : 'bg-slate-50 opacity-60 grayscale'}`}>
                                                    <td className="px-4 py-3 text-center">
                                                        <input
                                                            type="checkbox"
                                                            checked={isSelected}
                                                            onChange={() => toggleSelection(idx)}
                                                            className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                                                        />
                                                    </td>
                                                    <td className="px-4 py-3 text-slate-500 font-mono text-xs whitespace-nowrap">
                                                        {t.date}
                                                        {activeMonthFilter === 'ALL' && (
                                                            <span className="ml-2 px-1.5 py-0.5 bg-slate-100 border border-slate-200 text-[10px] rounded text-slate-400 font-bold scale-90 inline-block">
                                                                {monthKey}
                                                            </span>
                                                        )}
                                                    </td>
                                                    <td className={`px-4 py-3 font-medium text-sm ${isSelected ? 'text-slate-700' : 'text-slate-400'}`}>{t.description_normalized}</td>
                                                    <td className="px-4 py-3">
                                                        <span className={`px-2 py-1 rounded-md text-xs font-bold ${t.category === 'Uncategorized' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500'}`}>
                                                            {t.category}
                                                        </span>
                                                    </td>
                                                    <td className={`px-4 py-3 text-right font-mono font-bold ${isSelected ? (t.amount > 0 ? 'text-emerald-600' : 'text-slate-800') : 'text-slate-400'}`}>
                                                        {t.amount}
                                                    </td>
                                                </tr>
                                            )
                                        })}
                                    </tbody>
                                </table>
                            </div>
                            <div className="mt-4 flex justify-between items-center text-xs text-slate-500">
                                <button onClick={() => setStep('MAP')} className="hover:text-indigo-600 underline font-bold">Corregir Mapeo</button>
                                <p>Se importarán solo las filas marcadas.</p>
                            </div>
                        </div>
                    )
                }
            </div>
        </div >
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
