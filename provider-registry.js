(function() {
  'use strict';

  const BRAND = {
    name: 'Chef',
    shortName: 'Chef',
    description: 'AI browser agent powered by OpenRouter'
  };

  const STORAGE_KEY = 'chefProviderState';
  const LEGACY_PROVIDER_KEY = 'providerConfig';

  function createModel(id, name, options) {
    return {
      id,
      name,
      description: options?.description || '',
      supportsVision: Boolean(options?.supportsVision),
      category: options?.category || 'chat'
    };
  }

  const PROVIDERS = {
    openrouter: {
      id: 'openrouter',
      label: 'OpenRouter',
      transport: 'openai',
      color: '#000000',
      colorDark: '#FFFFFF',
      requiresApiKey: true,
      defaultBaseUrl: 'https://openrouter.ai/api/v1',
      defaultModel: 'openai/gpt-4o-mini',
      publicModelsUrl: 'https://openrouter.ai/api/v1/models',
      models: [
        createModel('openai/gpt-4o-mini', 'GPT-4o Mini', { supportsVision: true }),
        createModel('anthropic/claude-3.5-sonnet', 'Claude 3.5 Sonnet', { supportsVision: true }),
        createModel('google/gemini-2.0-flash-001', 'Gemini 2.0 Flash', { supportsVision: true }),
        createModel('openai/gpt-5', 'GPT-5', { supportsVision: true }),
        createModel('openai/gpt-5-mini', 'GPT-5 Mini', { supportsVision: true }),
        createModel('openai/o3', 'o3', { supportsVision: true }),
        createModel('openai/o4-mini', 'o4-mini', { supportsVision: true }),
        createModel('anthropic/claude-opus-4.1', 'Claude Opus 4.1', { supportsVision: true }),
        createModel('anthropic/claude-sonnet-4.5', 'Claude Sonnet 4.5', { supportsVision: true }),
        createModel('google/gemini-2.5-pro', 'Gemini 2.5 Pro', { supportsVision: true }),
        createModel('google/gemini-2.5-flash', 'Gemini 2.5 Flash', { supportsVision: true }),
        createModel('x-ai/grok-4.20-beta', 'Grok 4.20 Beta', { supportsVision: true })
      ]
    }
  };

  function deepClone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function normalizeModel(model) {
    return {
      id: model.id,
      name: model.name || model.id,
      description: model.description || '',
      supportsVision: Boolean(model.supportsVision),
      category: model.category || 'chat'
    };
  }

  function mergeModels(baseModels, incomingModels) {
    const merged = [];
    const byId = new Map();

    [...(baseModels || []), ...(incomingModels || [])].forEach((model) => {
      if (!model?.id) {
        return;
      }

      const normalized = normalizeModel(model);
      const existing = byId.get(normalized.id);
      if (existing) {
        existing.name = existing.name || normalized.name;
        existing.description = existing.description || normalized.description;
        existing.supportsVision = existing.supportsVision || normalized.supportsVision;
        existing.category = existing.category || normalized.category;
        return;
      }

      byId.set(normalized.id, normalized);
      merged.push(normalized);
    });

    return merged;
  }

  function buildDefaultState() {
    const providers = {};
    Object.values(PROVIDERS).forEach((provider) => {
      providers[provider.id] = {
        enabled: provider.id === 'openrouter',
        apiKey: '',
        baseUrl: provider.defaultBaseUrl,
        model: provider.defaultModel,
        models: deepClone(provider.models),
        lastSyncedAt: null
      };
    });

    return {
      version: 2,
      activeProvider: 'openrouter',
      providers
    };
  }

  function isStorageAvailable() {
    return Boolean(globalThis.chrome?.storage?.local);
  }

  async function loadState() {
    const fallback = buildDefaultState();
    if (!isStorageAvailable()) {
      return fallback;
    }

    const stored = await chrome.storage.local.get([STORAGE_KEY, LEGACY_PROVIDER_KEY]);
    const state = stored?.[STORAGE_KEY];
    if (state?.providers) {
      return normalizeState(state);
    }

    const legacy = stored?.[LEGACY_PROVIDER_KEY];
    if (legacy?.provider) {
      const upgraded = buildDefaultState();
      Object.keys(upgraded.providers).forEach((providerId) => {
        if (legacy[providerId]) {
          upgraded.providers[providerId] = {
            ...upgraded.providers[providerId],
            ...legacy[providerId]
          };
        }
      });
      upgraded.activeProvider = legacy.provider;
      return normalizeState(upgraded);
    }

    return fallback;
  }

  function normalizeState(input) {
    const normalized = buildDefaultState();
    normalized.version = input?.version || 2;
    normalized.activeProvider = input?.activeProvider || normalized.activeProvider;

    Object.keys(normalized.providers).forEach((providerId) => {
      const existing = input?.providers?.[providerId];
      if (!existing) {
        return;
      }

      normalized.providers[providerId] = {
        ...normalized.providers[providerId],
        ...existing,
        models: Array.isArray(existing.models) && existing.models.length
          ? mergeModels(normalized.providers[providerId].models, existing.models)
          : normalized.providers[providerId].models
      };
    });

    if (!normalized.providers[normalized.activeProvider]) {
      normalized.activeProvider = 'openrouter';
    }

    return normalized;
  }

  function getProviderDefinition(providerId) {
    return PROVIDERS[providerId] || PROVIDERS.openrouter;
  }

  function isConfiguredProvider(providerId, providerState) {
    const definition = getProviderDefinition(providerId);
    if (!providerState?.enabled) {
      return false;
    }

    if (!definition.requiresApiKey) {
      return true;
    }

    return Boolean(providerState.apiKey);
  }

  function getActiveProviderState(state) {
    return state.providers[state.activeProvider] || state.providers.openrouter;
  }

  function getActiveProviderDefinition(state) {
    return getProviderDefinition(state.activeProvider);
  }

  function getCurrentModel(state) {
    const providerState = getActiveProviderState(state);
    const modelId = providerState.model;
    return providerState.models.find((model) => model.id === modelId)
      || providerState.models[0]
      || { id: modelId, name: modelId, supportsVision: true };
  }

  function modelSupportsVision(state, providerId, modelId) {
    const effectiveProviderId = providerId || state.activeProvider;
    const effectiveModelId = modelId || state.providers[effectiveProviderId]?.model;
    const providerState = state.providers[effectiveProviderId];
    if (!providerState) {
      return inferVisionSupport(effectiveProviderId, effectiveModelId);
    }

    const model = providerState.models.find((entry) => entry.id === effectiveModelId);
    return model ? model.supportsVision !== false : inferVisionSupport(effectiveProviderId, effectiveModelId);
  }

  function inferVisionSupport(providerId, modelId) {
    const value = String(modelId || '').toLowerCase();
    if (!value) {
      return false;
    }

    // For OpenRouter, model IDs include the provider prefix (e.g. "anthropic/claude-*",
    // "google/gemini-*", "openai/gpt-4o-*"), so the generic heuristics below handle
    // all registered models correctly without needing provider-specific branches.

    // Exclude non-chat model types
    if (/(embed|whisper|tts|transcribe|moderation|rerank|audio|speech)/.test(value)) {
      return false;
    }

    // Positive vision indicators (explicit signals in model name)
    if (/(vision|vl\b|llava|multimodal|pixtral)/.test(value)) {
      return true;
    }

    // Known vision-capable model families
    if (/claude|gemini|gpt-(4o|4\.1|5)/.test(value)) {
      return true;
    }

    // Default to false for safety — text-only is the safe assumption
    return false;
  }

  function shouldKeepModel(modelId) {
    const value = String(modelId || '').toLowerCase();
    return !/(embed|moderation|whisper|tts|transcribe|image|speech|audio|rerank)/.test(value);
  }

  function getModelDescription(definition, model) {
    if (model.description) {
      return model.description;
    }

    if (model.supportsVision) {
      return `${definition.label} vision-enabled model`;
    }

    return `${definition.label} text model`;
  }

  async function fetchProviderModels(providerId, providerState) {
    const definition = getProviderDefinition(providerId);
    const headers = {};
    if (providerState.apiKey) {
      headers.Authorization = `Bearer ${providerState.apiKey}`;
    }

    const baseUrl = String(providerState.baseUrl || definition.defaultBaseUrl).replace(/\/+$/, '');
    const modelsUrl = definition.publicModelsUrl && !providerState.apiKey
      ? definition.publicModelsUrl
      : `${baseUrl}/models`;
    const response = await fetch(modelsUrl, { headers });
    const data = await response.json();
    const models = Array.isArray(data.data) ? data.data : Array.isArray(data.models) ? data.models : [];

    return mergeModels(definition.models, models
      .map((item) => {
        const id = item.id || item.name;
        if (!id) {
          return null;
        }

        const supportsVision = Array.isArray(item?.architecture?.input_modalities)
          ? item.architecture.input_modalities.includes('image')
          : inferVisionSupport(providerId, id);

        return createModel(id, item.name || id, {
          description: item.description || '',
          supportsVision
        });
      })
      .filter((model) => model && shouldKeepModel(model.id))
      .sort((left, right) => left.id.localeCompare(right.id)));
  }

  function getEnabledProviders(state) {
    return Object.keys(state.providers)
      .filter((providerId) => isConfiguredProvider(providerId, state.providers[providerId]))
      .map((providerId) => ({
        definition: getProviderDefinition(providerId),
        state: state.providers[providerId]
      }));
  }

  function getSelectorProviders(state) {
    const providerIds = new Set(
      Object.keys(state.providers).filter((providerId) => state.providers[providerId]?.enabled)
    );

    providerIds.add(state.activeProvider);

    return Array.from(providerIds)
      .filter((providerId) => state.providers[providerId])
      .map((providerId) => ({
        definition: getProviderDefinition(providerId),
        state: state.providers[providerId]
      }));
  }

  function getLegacyProviderConfig(state) {
    const activeDefinition = getActiveProviderDefinition(state);
    const activeState = getActiveProviderState(state);
    const legacy = {
      provider: state.activeProvider
    };

    Object.keys(state.providers).forEach((providerId) => {
      legacy[providerId] = {
        baseUrl: state.providers[providerId].baseUrl,
        apiKey: state.providers[providerId].apiKey,
        model: state.providers[providerId].model
      };
    });

    legacy.active = {
      id: activeDefinition.id,
      baseUrl: activeState.baseUrl,
      apiKey: activeState.apiKey,
      model: activeState.model,
      transport: activeDefinition.transport
    };

    return legacy;
  }

  function buildFeaturePayload(state) {
    const modelOptions = [];
    getSelectorProviders(state).forEach(({ definition, state: providerState }) => {
      providerState.models.forEach((model) => {
        modelOptions.push({
          model: model.id,
          name: model.name,
          description: getModelDescription(definition, model),
          provider: definition.label,
          providerId: definition.id,
          supportsVision: model.supportsVision !== false
        });
      });
    });

    const currentModel = getCurrentModel(state);
    const brandSystemPrompt = `You are Chef, an AI browser agent inside a Chrome extension. You can browse, inspect pages, use screenshots, and operate browser tools on the user's behalf.\n\nCapabilities:\n- Take screenshots of the current page\n- Click, type, scroll, and navigate web pages\n- Read page content and extract information\n- Execute JavaScript on pages\n- Open new tabs and switch between them\n- Help users complete browser tasks efficiently and safely\n\nGuidelines:\n- Be helpful, honest, and careful\n- Take a screenshot before acting on unfamiliar pages when visual context matters\n- Explain your intended next step before taking actions\n- Protect sensitive information and do not submit private data unless the user explicitly instructs you\n- Use {{currentDateTime}} as the current date/time reference\n- The current model is {{modelName}}`;

    return {
      payload: {
        features: {
          chrome_ext_models: {
            value: {
              default: currentModel.id,
              options: modelOptions,
              models: modelOptions
            },
            on: true
          },
          chrome_ext_model_selector: {
            value: {
              default: currentModel.id,
              options: modelOptions.map((option) => ({
                value: option.model,
                label: option.name,
                description: option.description
              }))
            },
            on: true
          },
          chrome_ext_announcement: { value: {}, on: true },
          chrome_ext_version_info: { value: {}, on: true },
          chrome_ext_flash_enabled: { value: false, on: true },
          chrome_ext_downloads: { value: false, on: true },
          chrome_ext_system_prompt: {
            value: { systemPrompt: brandSystemPrompt },
            on: true
          },
          chrome_ext_skip_perms_system_prompt: {
            value: {
              skipPermissionsSystemPrompt: `${brandSystemPrompt}\n\nYou have been granted permission to act without asking for confirmation on each action.`
            },
            on: true
          },
          chrome_ext_multiple_tabs_system_prompt: { value: {}, on: true },
          chrome_ext_explicit_permissions_prompt: { value: {}, on: true },
          chrome_ext_tool_usage_prompt: { value: {}, on: true },
          chrome_ext_custom_tool_prompts: { value: {}, on: true },
          chrome_ext_purl_config: { value: null, on: true },
          chrome_ext_purl_prompt: { value: '', on: true },
          chrome_ext_oauth_refresh: { value: {}, on: true }
        }
      },
      timestamp: Date.now()
    };
  }

  async function syncStateToChrome(state) {
    if (!isStorageAvailable()) {
      return state;
    }

    const activeDefinition = getActiveProviderDefinition(state);
    const activeState = getActiveProviderState(state);
    const currentModel = getCurrentModel(state);

    await chrome.storage.local.set({
      [STORAGE_KEY]: state,
      [LEGACY_PROVIDER_KEY]: getLegacyProviderConfig(state),
      chefBrand: BRAND,
      chefActiveProvider: {
        id: activeDefinition.id,
        label: activeDefinition.label,
        color: activeDefinition.color,
        colorDark: activeDefinition.colorDark,
        transport: activeDefinition.transport
      },
      // 'anthropicApiKey' is a Chrome storage key expected by the Claude for Chrome
      // host app. We mirror the active provider's API key here so the host app
      // treats itself as authenticated. This is a compatibility shim — the value
      // is never sent to Anthropic's API.
      anthropicApiKey: activeState.apiKey || 'chef-key',
      selectedModel: currentModel.id,
      selectedModelQuickMode: currentModel.id,
      accessToken: 'chef-access-token',
      refreshToken: 'chef-refresh-token',
      tokenExpiry: Date.now() + 365 * 24 * 60 * 60 * 1000,
      lastAuthFailureReason: undefined,
      browserControlPermissionAccepted: true,
      announcementDismissed: 'all',
      lastPermissionModePreference: 'ask',
      features: buildFeaturePayload(state)
    });

    return state;
  }

  async function saveState(partialState) {
    const normalized = normalizeState(partialState);
    return syncStateToChrome(normalized);
  }

  async function updateState(mutator) {
    const current = await loadState();
    const draft = normalizeState(deepClone(current));
    await mutator(draft);
    return saveState(draft);
  }

  function getProviderTheme(providerId) {
    const definition = getProviderDefinition(providerId);
    return {
      color: definition.color,
      colorDark: definition.colorDark
    };
  }

  globalThis.ChefRegistry = {
    BRAND,
    PROVIDERS,
    STORAGE_KEY,
    buildDefaultState,
    loadState,
    saveState,
    updateState,
    fetchProviderModels,
    getEnabledProviders,
    getSelectorProviders,
    getProviderDefinition,
    getActiveProviderDefinition,
    getActiveProviderState,
    getCurrentModel,
    modelSupportsVision,
    getLegacyProviderConfig,
    buildFeaturePayload,
    syncStateToChrome,
    getProviderTheme,
    isConfiguredProvider,
    mergeModels
  };
})();
