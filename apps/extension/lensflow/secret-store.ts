import type { ProviderSecretStore } from "@lensflow/contracts";
import { STORAGE_KEYS } from "../shared/storage";

type SecretMap = Record<string, string>;

export class ChromeProviderSecretStore implements ProviderSecretStore {
  async get(providerId: string): Promise<string | undefined> {
    const [session, local] = await Promise.all([
      browser.storage.session.get(STORAGE_KEYS.sessionProviderSecrets),
      browser.storage.local.get(STORAGE_KEYS.providerSecrets)
    ]);
    const sessionMap = (session[STORAGE_KEYS.sessionProviderSecrets] ?? {}) as SecretMap;
    const localMap = (local[STORAGE_KEYS.providerSecrets] ?? {}) as SecretMap;
    return sessionMap[providerId] || localMap[providerId];
  }

  async set(providerId: string, secret: string, persist: boolean): Promise<void> {
    const [session, local] = await Promise.all([
      browser.storage.session.get(STORAGE_KEYS.sessionProviderSecrets),
      browser.storage.local.get(STORAGE_KEYS.providerSecrets)
    ]);
    const sessionMap = { ...((session[STORAGE_KEYS.sessionProviderSecrets] ?? {}) as SecretMap) };
    const localMap = { ...((local[STORAGE_KEYS.providerSecrets] ?? {}) as SecretMap) };
    if (persist) {
      localMap[providerId] = secret;
      delete sessionMap[providerId];
    } else {
      sessionMap[providerId] = secret;
      delete localMap[providerId];
    }
    await Promise.all([
      browser.storage.session.set({ [STORAGE_KEYS.sessionProviderSecrets]: sessionMap }),
      browser.storage.local.set({ [STORAGE_KEYS.providerSecrets]: localMap })
    ]);
  }

  async remove(providerId: string): Promise<void> {
    const [session, local] = await Promise.all([
      browser.storage.session.get(STORAGE_KEYS.sessionProviderSecrets),
      browser.storage.local.get(STORAGE_KEYS.providerSecrets)
    ]);
    const sessionMap = { ...((session[STORAGE_KEYS.sessionProviderSecrets] ?? {}) as SecretMap) };
    const localMap = { ...((local[STORAGE_KEYS.providerSecrets] ?? {}) as SecretMap) };
    delete sessionMap[providerId];
    delete localMap[providerId];
    await Promise.all([
      browser.storage.session.set({ [STORAGE_KEYS.sessionProviderSecrets]: sessionMap }),
      browser.storage.local.set({ [STORAGE_KEYS.providerSecrets]: localMap })
    ]);
  }
}
