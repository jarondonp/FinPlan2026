import React from 'react';
import { Sparkles, ShieldCheck, Cloud, LayoutDashboard, ArrowRight } from 'lucide-react';

interface LoginScreenProps {
    onLogin: () => Promise<void>;
}

export const LoginScreen = ({ onLogin }: LoginScreenProps) => {
    return (
        <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
            <div className="max-w-md w-full bg-slate-800 rounded-2xl shadow-2xl overflow-hidden border border-slate-700 animate-in fade-in zoom-in duration-500">
                {/* Header Graphic */}
                <div className="bg-indigo-600 p-8 text-center relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-full h-full bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-10"></div>
                    <div className="relative z-10 flex flex-col items-center">
                        <div className="p-3 bg-white/20 backdrop-blur-sm rounded-xl mb-4 shadow-lg">
                            <Sparkles size={32} className="text-white" />
                        </div>
                        <h1 className="text-2xl font-bold text-white mb-2">FinMap 2026</h1>
                        <p className="text-indigo-200 text-sm">Tu asistente financiero personal</p>
                    </div>
                </div>

                {/* Content */}
                <div className="p-8 space-y-6">
                    <div className="space-y-4">
                        <FeatureItem
                            icon={<Cloud className="text-blue-400" size={20} />}
                            title="Sincronización en la Nube"
                            desc="Accede a tus finanzas desde cualquier dispositivo."
                        />
                        <FeatureItem
                            icon={<ShieldCheck className="text-emerald-400" size={20} />}
                            title="Respaldo Automático"
                            desc="Tus datos seguros y nunca más perdidos."
                        />
                        <FeatureItem
                            icon={<LayoutDashboard className="text-purple-400" size={20} />}
                            title="Gestión Inteligente"
                            desc="Potenciado por IA para optimizar tu dinero."
                        />
                    </div>

                    <div className="pt-4">
                        <button
                            onClick={onLogin}
                            className="w-full bg-white hover:bg-slate-50 text-slate-900 font-bold py-3.5 px-4 rounded-xl transition-all flex items-center justify-center gap-3 shadow-lg hover:shadow-xl group"
                        >
                            <img
                                src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg"
                                alt="Google"
                                className="w-5 h-5"
                            />
                            <span>Iniciar Sesión con Google</span>
                            <ArrowRight size={18} className="text-slate-400 group-hover:translate-x-1 transition-transform" />
                        </button>
                        <p className="text-center text-slate-500 text-xs mt-4">
                            Al continuar, aceptas sincronizar tus datos financieros.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
};

const FeatureItem = ({ icon, title, desc }: any) => (
    <div className="flex items-start gap-3 p-3 rounded-lg hover:bg-slate-700/50 transition-colors">
        <div className="mt-1">{icon}</div>
        <div>
            <h3 className="text-slate-200 font-medium text-sm">{title}</h3>
            <p className="text-slate-400 text-xs leading-relaxed">{desc}</p>
        </div>
    </div>
);
