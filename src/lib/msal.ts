
import { PublicClientApplication } from "@azure/msal-browser";

const msalConfig = {
  auth: {
    clientId: process.env.NEXT_PUBLIC_MSAL_CLIENT_ID || "31cc463a-694b-4fb1-b3c5-16e09fa5ef8c",
    authority: `https://login.microsoftonline.com/${process.env.NEXT_PUBLIC_MSAL_TENANT_ID || "6886bf65-caf5-456b-bfd0-f1e9c5bd00de"}`,
    redirectUri: "/",
  },
  cache: {
    cacheLocation: "sessionStorage", 
    storeAuthStateInCookie: false, 
  }
};

export const msalInstance = new PublicClientApplication(msalConfig);
