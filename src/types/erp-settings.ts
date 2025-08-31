
export type ErpPaymentPrefs = {
  company: string;
  defaultModeOfPayment: string;    // ex: "Bank Transfer"
  defaultBankGLAccount: string;    // ex: "1000 - Bank - BRUG"
  defaultBankAccountName?: string; // opțional, util la Payment Entry
  defaultCurrency?: string;        // ex: "EUR"
};
