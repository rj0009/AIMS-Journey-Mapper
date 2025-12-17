// Declaration for global Google API objects loaded via script tags
declare global {
  interface Window {
    gapi: any;
    google: any;
  }
}

const SCOPES = 'https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive.file';
const DISCOVERY_DOCS = [
  'https://sheets.googleapis.com/$discovery/rest?version=v4',
  'https://www.googleapis.com/discovery/v1/apis/drive/v3/rest'
];

let tokenClient: any;
let gapiInited = false;
let gisInited = false;

// Helper to wait for scripts to load
const waitForGoogleScripts = async () => {
  let retries = 0;
  while (retries < 20) {
    if (window.gapi && window.google) return true;
    await new Promise(r => setTimeout(r, 200));
    retries++;
  }
  return false;
};

/**
 * Initialize the GAPI client.
 */
export const initGapiClient = async () => {
  if (gapiInited) return;
  
  await new Promise<void>((resolve, reject) => {
    if (window.gapi) {
      window.gapi.load('client', { callback: resolve, onerror: reject });
    } else {
      reject(new Error("GAPI not loaded"));
    }
  });
  
  await window.gapi.client.init({
    discoveryDocs: DISCOVERY_DOCS,
  });
  gapiInited = true;
};

/**
 * Initialize the Google Identity Services client.
 */
export const initGisClient = (clientId: string) => {
  if (gisInited) return;
  if (!window.google) throw new Error("Google Identity Services not loaded");
  
  tokenClient = window.google.accounts.oauth2.initTokenClient({
    client_id: clientId,
    scope: SCOPES,
    callback: '', // Defined at request time
  });
  gisInited = true;
};

/**
 * Trigger the login flow.
 */
export const connectGoogle = async (clientId: string): Promise<boolean> => {
  try {
    const scriptsReady = await waitForGoogleScripts();
    if (!scriptsReady) throw new Error("Google scripts failed to load. Please refresh.");

    if (!gapiInited) await initGapiClient();
    if (!gisInited) initGisClient(clientId);
    
    return new Promise((resolve, reject) => {
      tokenClient.callback = async (resp: any) => {
        if (resp.error !== undefined) {
          reject(resp);
        }
        resolve(true);
      };
      // Request access token
      if (window.gapi.client.getToken() === null) {
        tokenClient.requestAccessToken({ prompt: 'consent' });
      } else {
        tokenClient.requestAccessToken({ prompt: '' });
      }
    });
  } catch (err) {
    console.error("Google Auth Error", err);
    return false;
  }
};

/**
 * Find or create the specific log sheet.
 */
const getOrCreateLogSheet = async (): Promise<string> => {
  const SPREADSHEET_NAME = "NCSS AIMS 2.0 - Journey Map Logs";
  
  // 1. Search for existing file
  const response = await window.gapi.client.drive.files.list({
    q: `name = '${SPREADSHEET_NAME}' and mimeType = 'application/vnd.google-apps.spreadsheet' and trashed = false`,
    fields: 'files(id, name)',
  });
  
  if (response.result.files && response.result.files.length > 0) {
    return response.result.files[0].id;
  }
  
  // 2. Create new if not found
  const createResponse = await window.gapi.client.sheets.spreadsheets.create({
    properties: { title: SPREADSHEET_NAME },
  });
  
  const spreadsheetId = createResponse.result.spreadsheetId;
  
  // 3. Add Header Row
  await window.gapi.client.sheets.spreadsheets.values.update({
    spreadsheetId,
    range: 'Sheet1!A1',
    valueInputOption: 'RAW',
    resource: {
      values: [['Timestamp', 'User', 'Session Title', 'Transcript Length', 'User Actions', 'Pain Points']]
    }
  });
  
  return spreadsheetId;
};

/**
 * Append a log entry to the Google Sheet.
 */
export const logSessionToSheet = async (
  username: string, 
  title: string, 
  transcriptLength: number,
  userActions: string[],
  painPoints: string[]
) => {
  try {
    const spreadsheetId = await getOrCreateLogSheet();
    
    const row = [
      new Date().toISOString(),
      username,
      title,
      transcriptLength.toString(),
      userActions.join(', '),
      painPoints.join(', ')
    ];
    
    await window.gapi.client.sheets.spreadsheets.values.append({
      spreadsheetId,
      range: 'Sheet1!A1',
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      resource: {
        values: [row]
      }
    });
    
    return true;
  } catch (e) {
    console.error("Error logging to Sheets", e);
    throw e;
  }
};