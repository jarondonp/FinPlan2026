import React, { useState } from 'react';
import Dexie from 'dexie';
import { db } from '../../db/db';
import { Download, Upload, RefreshCw, CheckCircle, AlertTriangle } from 'lucide-react';

export const BackupManager = () => {
    const [status, setStatus] = useState<'idle' | 'exporting' | 'importing' | 'success' | 'error'>('idle');
    const [message, setMessage] = useState('');

    const handleExport = async () => {
        try {
            setStatus('exporting');
            setMessage('Preparando copia de seguridad...');

            const backup = {
                version: db.verno,
                exportDate: new Date().toISOString(),
                tables: {} as Record<string, any[]>
            };

            // Export all tables
            const tables = db.tables.map(t => t.name);
            for (const tableName of tables) {
                backup.tables[tableName] = await db.table(tableName).toArray();
            }

            // Create download
            const dataStr = JSON.stringify(backup, null, 2);
            const dataBlob = new Blob([dataStr], { type: 'application/json' });
            const url = URL.createObjectURL(dataBlob);

            const link = document.createElement('a');
            link.href = url;
            link.download = `finmap-backup-${new Date().toISOString().split('T')[0]}.json`;
            link.click();

            setStatus('success');
            setMessage(`✅ Backup descargado exitosamente (${Object.keys(backup.tables).length} tablas)`);
        } catch (e: any) {
            setStatus('error');
            setMessage(`Error exportando: ${e.message}`);
        }
    };

    const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        try {
            setStatus('importing');
            setMessage('Leyendo archivo de respaldo...');

            const text = await file.text();
            const backup = JSON.parse(text);

            if (!backup.tables || !backup.version) {
                throw new Error("Archivo de backup inválido");
            }

            setMessage('Restaurando base de datos...');

            // Clear and Restore transactions
            await db.transaction('rw', db.tables, async () => {
                // Clear all existing data to prevent duplicates
                await Promise.all(db.tables.map(table => table.clear()));

                // Restore data
                for (const [tableName, records] of Object.entries(backup.tables)) {
                    if (records && Array.isArray(records)) {
                        await db.table(tableName).bulkAdd(records);
                    }
                }
            });

            setStatus('success');
            setMessage('✅ Restauración completada. Por favor refresca la página.');
            setTimeout(() => window.location.reload(), 2000);

        } catch (e: any) {
            setStatus('error');
            setMessage(`Error restaurando: ${e.message}`);
        }
    };

    return (
        <div className="bg-slate-800 text-white p-6 rounded-xl shadow-lg border border-slate-700 mb-8">
            <div className="flex items-start justify-between mb-4">
                <div>
                    <h2 className="text-xl font-bold flex items-center gap-2">
                        <DowloadCloudIcon /> Centro de Rescate de Datos
                    </h2>
                    <p className="text-slate-400 text-sm mt-1">
                        Usa esto para descargar tus datos seguros o restaurar una copia anterior si la pantalla se ve vacía.
                    </p>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Export Section */}
                <div className="bg-slate-700/50 p-4 rounded-lg border border-slate-600">
                    <h3 className="font-bold text-indigo-300 mb-2 flex items-center gap-2">
                        <Download size={18} /> PASO 1: Guardar mis Datos
                    </h3>
                    <p className="text-xs text-slate-400 mb-3">
                        Descarga un archivo .json con toda tu información actual. Si la herramienta dice que "existen datos", esto los guardará en tu PC.
                    </p>
                    <button
                        onClick={handleExport}
                        disabled={status === 'exporting'}
                        className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 rounded-lg font-bold transition-colors flex items-center justify-center gap-2"
                    >
                        {status === 'exporting' ? <RefreshCw className="animate-spin" size={18} /> : <Download size={18} />}
                        DESCARGAR BACKUP AHORA
                    </button>
                </div>

                {/* Import Section */}
                <div className="bg-slate-700/50 p-4 rounded-lg border border-slate-600">
                    <h3 className="font-bold text-emerald-300 mb-2 flex items-center gap-2">
                        <Upload size={18} /> PASO 2: Restaurar (Si es necesario)
                    </h3>
                    <p className="text-xs text-slate-400 mb-3">
                        Si ves la pantalla vacía, carga el archivo que acabas de descargar para "forzar" al sistema a leerlo de nuevo.
                    </p>
                    <label className="w-full py-2 bg-emerald-600 hover:bg-emerald-700 rounded-lg font-bold transition-colors flex items-center justify-center gap-2 cursor-pointer">
                        <Upload size={18} />
                        CARGAR ARCHIVO DE RESTAURACIÓN
                        <input type="file" accept=".json" onChange={handleImport} className="hidden" />
                    </label>
                </div>
            </div>

            {/* Status Message */}
            {message && (
                <div className={`mt-4 p-3 rounded-lg flex items-center gap-3 ${status === 'error' ? 'bg-rose-900/50 text-rose-200' : 'bg-emerald-900/50 text-emerald-200'}`}>
                    {status === 'error' ? <AlertTriangle size={20} /> : <CheckCircle size={20} />}
                    <span className="font-mono text-sm">{message}</span>
                </div>
            )}
        </div>
    );
};

const DowloadCloudIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-cloud-download"><path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242" /><path d="M12 12v9" /><path d="m8 17 4 4 4-4" /></svg>
)
