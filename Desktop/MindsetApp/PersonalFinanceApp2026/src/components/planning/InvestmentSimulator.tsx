import React, { useState, useMemo } from 'react';
import { calculateCompoundInterest } from '../../utils/investmentLogic';
import { formatCurrency } from '../../utils';
import { TrendingUp, DollarSign, PiggyBank, Calendar } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';

export const InvestmentSimulator = () => {
    // State for inputs
    const [initialAmount, setInitialAmount] = useState(1000); // $1,000 initial
    const [monthlyContribution, setMonthlyContribution] = useState(200); // $200/mo
    const [annualRate, setAnnualRate] = useState(8); // 8% return
    const [years, setYears] = useState(10); // 10 years

    // Calculation
    const data = useMemo(() => {
        return calculateCompoundInterest(initialAmount, monthlyContribution, annualRate, years);
    }, [initialAmount, monthlyContribution, annualRate, years]);

    const finalResult = data[data.length - 1];

    return (
        <div className="p-8 max-w-7xl mx-auto animate-in fade-in duration-500 pb-20">
            <header className="mb-8">
                <div className="flex items-center gap-3 mb-2">
                    <div className="p-2 bg-violet-100 text-violet-600 rounded-lg">
                        <TrendingUp size={24} />
                    </div>
                    <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Simulador de Inversiones</h1>
                </div>
                <p className="text-slate-500">Proyecta el crecimiento de tu patrimonio con el poder del interés compuesto.</p>
            </header>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* --- Controls --- */}
                <div className="space-y-6">
                    <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                        <h3 className="font-bold text-slate-800 mb-6 flex items-center gap-2">
                            <SettingsIcon /> Parámetros
                        </h3>

                        <div className="space-y-5">
                            <div>
                                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 block">Capital Inicial</label>
                                <div className="relative">
                                    <DollarSign size={16} className="absolute left-3 top-3 text-slate-400" />
                                    <input
                                        type="number"
                                        className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-xl text-slate-800 font-bold focus:ring-2 focus:ring-violet-500 outline-none"
                                        value={initialAmount}
                                        onChange={e => setInitialAmount(Number(e.target.value))}
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 block">Aporte Mensual</label>
                                <div className="relative">
                                    <PiggyBank size={16} className="absolute left-3 top-3 text-slate-400" />
                                    <input
                                        type="number"
                                        className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-xl text-slate-800 font-bold focus:ring-2 focus:ring-violet-500 outline-none"
                                        value={monthlyContribution}
                                        onChange={e => setMonthlyContribution(Number(e.target.value))}
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 block">Tasa Anual (%)</label>
                                <div className="relative">
                                    <TrendingUp size={16} className="absolute left-3 top-3 text-slate-400" />
                                    <input
                                        type="number"
                                        className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-xl text-slate-800 font-bold focus:ring-2 focus:ring-violet-500 outline-none"
                                        value={annualRate}
                                        onChange={e => setAnnualRate(Number(e.target.value))}
                                    />
                                </div>
                                <div className="mt-2 flex justify-between text-[10px] text-slate-400 font-medium px-1">
                                    <span className="cursor-pointer hover:text-violet-600" onClick={() => setAnnualRate(4)}>Conservador (4%)</span>
                                    <span className="cursor-pointer hover:text-violet-600" onClick={() => setAnnualRate(8)}>S&P 500 (8%)</span>
                                    <span className="cursor-pointer hover:text-violet-600" onClick={() => setAnnualRate(12)}>Agresivo (12%)</span>
                                </div>
                            </div>

                            <div>
                                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 block">Años a proyectar: {years}</label>
                                <input
                                    type="range" min="1" max="50"
                                    className="w-full accent-violet-600 cursor-pointer"
                                    value={years}
                                    onChange={e => setYears(Number(e.target.value))}
                                />
                            </div>
                        </div>
                    </div>

                    {/* Summary Card */}
                    <div className="bg-violet-600 text-white p-6 rounded-2xl shadow-lg shadow-violet-200">
                        <div className="text-violet-200 text-xs font-bold uppercase tracking-wider mb-1">Monto Final Estimado</div>
                        <div className="text-4xl font-bold mb-6">{formatCurrency(finalResult.total)}</div>

                        <div className="grid grid-cols-2 gap-4 pt-4 border-t border-violet-500/30">
                            <div>
                                <div className="text-violet-200 text-[10px] uppercase">Tu Inversión</div>
                                <div className="font-bold text-lg">{formatCurrency(finalResult.invested)}</div>
                            </div>
                            <div>
                                <div className="text-violet-200 text-[10px] uppercase">Ganancia (Interés)</div>
                                <div className="font-bold text-lg text-emerald-300">+{formatCurrency(finalResult.interest)}</div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* --- Chart --- */}
                <div className="lg:col-span-2 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col">
                    <h3 className="font-bold text-slate-800 mb-6">Proyección de Crecimiento</h3>
                    <div className="flex-1 min-h-[400px]">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={data} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                                <defs>
                                    <linearGradient id="colorTotal" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.1} />
                                        <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                                    </linearGradient>
                                    <linearGradient id="colorInvested" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#94a3b8" stopOpacity={0.1} />
                                        <stop offset="95%" stopColor="#94a3b8" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <XAxis dataKey="year" tick={{ fontSize: 12 }} />
                                <YAxis tickFormatter={(val) => `$${val / 1000}k`} tick={{ fontSize: 12 }} />
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                <Tooltip
                                    formatter={(value: number) => formatCurrency(value)}
                                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                                />
                                <Legend />
                                <Area
                                    type="monotone"
                                    dataKey="total"
                                    name="Valor Total"
                                    stroke="#8b5cf6"
                                    strokeWidth={3}
                                    fillOpacity={1}
                                    fill="url(#colorTotal)"
                                />
                                <Area
                                    type="monotone"
                                    dataKey="invested"
                                    name="Dinero Aportado"
                                    stroke="#94a3b8"
                                    strokeWidth={2}
                                    strokeDasharray="5 5"
                                    fillOpacity={1}
                                    fill="url(#colorInvested)"
                                />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </div>
        </div>
    );
};

const SettingsIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-slate-400"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.1a2 2 0 0 1-1-1.72v-.51a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" /><circle cx="12" cy="12" r="3" /></svg>
);
