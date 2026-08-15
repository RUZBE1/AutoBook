import { getStoredAccessToken } from './auth'

const LEISURE_CENTRE_SETTINGS_URL =
  'https://iojgrjmve9.execute-api.eu-west-2.amazonaws.com/settings/leisure-centre'

export class SettingsApiError extends Error {}

async function getValidationMessage(response: Response) {
  try {
    const body = (await response.json()) as unknown

    if (typeof body === 'object' && body !== null) {
      if ('message' in body && typeof body.message === 'string') {
        return body.message
      }

      if ('error' in body && typeof body.error === 'string') {
        return body.error
      }
    }
  } catch {
    // The response did not contain a JSON validation message.
  }

  return 'Check the username and password and try again.'
}

export async function saveLeisureCentreCredentials(
  username: string,
  password: string,
) {
  const accessToken = getStoredAccessToken()

  if (!accessToken) {
    throw new SettingsApiError('Your session has expired. Please sign in again.')
  }

  let response: Response

  try {
    response = await fetch(LEISURE_CENTRE_SETTINGS_URL, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ username, password }),
    })
  } catch {
    throw new SettingsApiError('Unable to save credentials')
  }

  if (response.status === 200) {
    return
  }

  if (response.status === 400) {
    throw new SettingsApiError(await getValidationMessage(response))
  }

  if (response.status === 401) {
    throw new SettingsApiError('Your session has expired. Please sign in again.')
  }

  throw new SettingsApiError('Unable to save credentials')
}
