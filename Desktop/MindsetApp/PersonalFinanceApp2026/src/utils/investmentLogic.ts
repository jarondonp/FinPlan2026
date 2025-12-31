
export interface InvestmentDataPoint {
    year: number;
    invested: number;
    interest: number;
    total: number;
}

/**
 * Calculates compound interest with monthly contributions.
 * Formula: A = P(1 + r/n)^(nt) + PMT * ... (Future Value of Series)
 * But we'll iterate yearly for the chart data.
 */
export const calculateCompoundInterest = (
    initialPrincipal: number,
    monthlyContribution: number,
    annualRatePercent: number,
    years: number
): InvestmentDataPoint[] => {
    const r = annualRatePercent / 100;
    const n = 12; // Monthly compounding
    const result: InvestmentDataPoint[] = [];

    let currentTotal = initialPrincipal;
    let totalInvested = initialPrincipal;

    // Year 0
    result.push({
        year: 0,
        invested: initialPrincipal,
        interest: 0,
        total: initialPrincipal
    });

    for (let t = 1; t <= years; t++) {
        // Calculate for this year
        // We can do a simple loop for months to be accurate with monthly additions
        for (let m = 0; m < 12; m++) {
            currentTotal = (currentTotal + monthlyContribution) * (1 + r / 12);
            totalInvested += monthlyContribution;
        }

        result.push({
            year: t,
            invested: Math.round(totalInvested),
            interest: Math.round(currentTotal - totalInvested),
            total: Math.round(currentTotal)
        });
    }

    return result;
};
