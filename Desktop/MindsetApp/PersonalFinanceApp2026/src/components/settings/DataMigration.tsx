import React, { useState, useEffect } from 'react';
import { db } from '../../db/db'; // Dexie DB
import { db as firestore, auth } from '../../firebase/config'; // Firebase
import { collection, writeBatch, doc } from 'firebase/firestore';
import { Cloud, CheckCircle, AlertTriangle, ArrowUpCircle, Database } from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';

export const DataMigration = () => {
    const [status, setStatus] = useState<'idle' | 'scanning' | 'migrating' | 'success' | 'error'>('idle');
    const [progress, setProgress] = useState(0);
    const [log, setLog] = useState<string[]>([]);
    const [stats, setStats] = useState<Record<string, number>>({});

    const user = auth.currentUser;

    // Scan local data
    useEffect(() => {
        const scanData = async () => {
            if (status !== 'idle') return;
            setStatus('scanning');

            const counts: Record<string, number> = {};
            for (const table of db.tables) {
                counts[table.name] = await table.count();
            }
            setStats(counts);
            setStatus('idle');
        };
        scanData();
    }, []);

    const handleMigration = async () => {
        if (!user) {
            alert("Debes iniciar sesión para migrar.");
            return;
        }

        setStatus('migrating');
        setLog([]);

        try {
            const batchSize = 450; // Firestore batch limit is 500
            let totalOperations = 0;
            const tables = db.tables;
            const totalRecords = Object.values(stats).reduce((a, b) => a + b, 0);

            setLog(prev => [...prev, `Iniciando migración para usuario: ${user.email}`]);
            setLog(prev => [...prev, `Total registros a migrar: ${totalRecords}`]);

            for (const table of tables) {
                const records = await table.toArray();
                if (records.length === 0) continue;

                setLog(prev => [...prev, `Procesando tabla: ${table.name} (${records.length} items)...`]);

                // Process in chunks
                for (let i = 0; i < records.length; i += batchSize) {
                    const batch = writeBatch(firestore);
                    const chunk = records.slice(i, i + batchSize);

                    chunk.forEach((record: any) => {
                        // Use original ID if present, else auto-id
                        const recordId = record.id ? String(record.id) : doc(collection(firestore, 'temp')).id;

                        // Path: users/{uid}/{collectionName}/{docId}
                        const ref = doc(firestore, 'users', user.uid, table.name, recordId);

                        // Sanitize undefined values (Firestore doesn't like them)
                        const cleanRecord = JSON.parse(JSON.stringify(record));

                        batch.set(ref, {
                            ...cleanRecord,
                            _migratedAt: new Date().toISOString()
                        });
                    });

                    await batch.commit();
                    totalOperations += chunk.length;
                    setProgress(Math.round((totalOperations / totalRecords) * 100));
                }
                setLog(prev => [...prev, `✓ Tabla ${table.name} completada.`]);
            }

            setStatus('success');
            setLog(prev => [...prev, `¡ÉXITO! Migración completada.`]);

        } catch (error: any) {
            console.error(error);
            setStatus('error');
            setLog(prev => [...prev, `ERROR CRÍTICO: ${error.message}`]);
        }
    };

    return (
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
            <div className="flex items-center gap-4 mb-6">
                <div className="p-3 bg-indigo-100 text-indigo-600 rounded-lg">
                    <Cloud size={24} />
                </div>
                <div>
                    <h2 className="text-xl font-bold text-slate-900">Migración a la Nube</h2>
                    <p className="text-sm text-slate-500">Transfiere tus datos locales a tu cuenta segura de Firebase.</p>
                </div>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                {Object.entries(stats).map(([table, count]) => (
                    <div key={table} className="bg-slate-50 p-3 rounded-lg border border-slate-100">
                        <div className="text-xs font-medium text-slate-500 uppercase">{table}</div>
                        <div className="text-lg font-bold text-slate-700">{count}</div>
                    </div>
                ))}
            </div>

            {/* Actions */}
            <div className="flex flex-col gap-4">
                {status === 'idle' && (
                    <button
                        onClick={handleMigration}
                        className="flex items-center justify-center gap-2 w-full py-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold shadow-lg shadow-indigo-200 transition-all"
                    >
                        <ArrowUpCircle size={20} />
                        Comenzar Migración Ahora
                    </button>
                )}

                {status === 'migrating' && (
                    <div className="space-y-2">
                        <div className="flex justify-between text-sm font-medium text-slate-600">
                            <span>Subiendo datos...</span>
                            <span>{progress}%</span>
                        </div>
                        <div className="w-full bg-slate-200 rounded-full h-2.5 overflow-hidden">
                            <div
                                className="bg-indigo-600 h-2.5 rounded-full transition-all duration-300"
                                style={{ width: `${progress}%` }}
                            ></div>
                        </div>
                    </div>
                )}

                {status === 'success' && (
                    <div className="p-4 bg-emerald-50 text-emerald-700 rounded-lg flex items-center gap-3 border border-emerald-100">
                        <CheckCircle size={24} />
                        <div>
                            <p className="font-bold">¡Migración Exitosa!</p>
                            <p className="text-sm">Tus datos ahora viven en la nube. Puedes usar la app normalmente.</p>
                        </div>
                    </div>
                )}

                {status === 'error' && (
                    <div className="p-4 bg-rose-50 text-rose-700 rounded-lg flex items-center gap-3 border border-rose-100">
                        <AlertTriangle size={24} />
                        <div>
                            <p className="font-bold">Error en la migración</p>
                            <p className="text-sm">Revisa el registro para más detalles.</p>
                        </div>
                    </div>
                )}
            </div>

            {/* Log Console */}
            {log.length > 0 && (
                <div className="mt-6 bg-slate-900 rounded-lg p-4 font-mono text-xs text-slate-300 max-h-48 overflow-auto">
                    {log.map((line, i) => (
                        <div key={i} className="border-b border-slate-800/50 py-1 last:border-0">
                            {line}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};
