export const AVAILABLE_COLORS = [
    "bg-blue-100 text-blue-700",
    "bg-orange-100 text-orange-700",
    "bg-green-100 text-green-700",
    "bg-yellow-100 text-yellow-700",
    "bg-cyan-100 text-cyan-700",
    "bg-pink-100 text-pink-700",
    "bg-purple-100 text-purple-700",
    "bg-red-100 text-red-700",
    "bg-indigo-100 text-indigo-700",
    "bg-teal-100 text-teal-700",
    "bg-rose-100 text-rose-700",
    "bg-lime-100 text-lime-700",
    "bg-fuchsia-100 text-fuchsia-700",
    "bg-sky-100 text-sky-700",
];

export const generateId = () => Math.random().toString(36).substr(2, 9);

export const formatCurrency = (amount: number, currency = "USD") => {
    return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: currency,
        maximumFractionDigits: 0
    }).format(amount);
};

export const getRandomColor = () => AVAILABLE_COLORS[Math.floor(Math.random() * AVAILABLE_COLORS.length)];

export const DEFAULT_CATEGORIES = [
    { name: "Housing", color: "bg-blue-100 text-blue-700", budgetLimit: 2000 },
    { name: "Food & Dining", color: "bg-orange-100 text-orange-700", budgetLimit: 600 },
    { name: "Groceries", color: "bg-green-100 text-green-700", budgetLimit: 400 },
    { name: "Transportation", color: "bg-yellow-100 text-yellow-700", budgetLimit: 300 },
    { name: "Utilities", color: "bg-cyan-100 text-cyan-700", budgetLimit: 200 },
    { name: "Shopping", color: "bg-pink-100 text-pink-700", budgetLimit: 150 },
    { name: "Entertainment", color: "bg-purple-100 text-purple-700", budgetLimit: 100 },
    { name: "Health", color: "bg-red-100 text-red-700", budgetLimit: 100 },
    { name: "Income", color: "bg-emerald-100 text-emerald-700" },
    { name: "Transfer", color: "bg-gray-100 text-gray-700" },
    { name: "Uncategorized", color: "bg-slate-100 text-slate-600" },
];

export const getStartOfMonth = (date: Date = new Date()) => {
    return new Date(date.getFullYear(), date.getMonth(), 1);
};

export const getEndOfMonth = (date: Date = new Date()) => {
    return new Date(date.getFullYear(), date.getMonth() + 1, 0);
};

export const formatMonth = (date: Date) => {
    return date.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
};

