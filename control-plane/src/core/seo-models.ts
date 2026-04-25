export type SeoModelCategory =
  | "recommended"
  | "budget"
  | "long_context"
  | "experimental";

export type SeoModelOption = {
  id: string;
  label: string;
  description: string;
  category: SeoModelCategory;
  supportsJsonMode: boolean;
  recommended?: boolean;
  pricingUsdPerMillion: {
    input: number;
    output: number;
  };
};

export const seoModelOptions: SeoModelOption[] = [
  {
    id: "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
    label: "Llama 3.3 70B fast",
    description: "Recommended Cloudflare-native model for structured SEO draft generation.",
    category: "recommended",
    supportsJsonMode: true,
    recommended: true,
    pricingUsdPerMillion: {
      input: 0.293,
      output: 2.253
    }
  },
  {
    id: "@cf/openai/gpt-oss-120b",
    label: "gpt-oss-120b",
    description: "High-reasoning option for more complex planning and content generation.",
    category: "long_context",
    supportsJsonMode: false,
    pricingUsdPerMillion: {
      input: 0.35,
      output: 0.75
    }
  },
  {
    id: "@cf/openai/gpt-oss-20b",
    label: "gpt-oss-20b",
    description: "Lower-cost model for fast iterations and lighter workloads.",
    category: "recommended",
    supportsJsonMode: false,
    pricingUsdPerMillion: {
      input: 0.2,
      output: 0.3
    }
  },
  {
    id: "@cf/zai-org/glm-4.7-flash",
    label: "GLM 4.7 Flash",
    description: "Budget-friendly choice for high-volume experiments.",
    category: "budget",
    supportsJsonMode: false,
    pricingUsdPerMillion: {
      input: 0.06,
      output: 0.4
    }
  },
  {
    id: "@cf/meta/llama-4-scout-17b-16e-instruct",
    label: "Llama 4 Scout",
    description: "Long-context option suitable for richer site-level context windows.",
    category: "long_context",
    supportsJsonMode: false,
    pricingUsdPerMillion: {
      input: 0.27,
      output: 0.85
    }
  },
  {
    id: "@cf/qwen/qwen3-30b-a3b-fp8",
    label: "Qwen3 30B A3B",
    description: "Cost-efficient general instruction model.",
    category: "budget",
    supportsJsonMode: false,
    pricingUsdPerMillion: {
      input: 0.051,
      output: 0.34
    }
  },
  {
    id: "@cf/meta/llama-3.2-3b-instruct",
    label: "Llama 3.2 3B",
    description: "Very low-cost option for smoke tests and internal prototyping.",
    category: "budget",
    supportsJsonMode: false,
    pricingUsdPerMillion: {
      input: 0.051,
      output: 0.34
    }
  },
  {
    id: "@cf/meta/llama-3.1-8b-instruct-fp8",
    label: "Llama 3.1 8B FP8",
    description: "Legacy calculator-site model that still works well for structured prompt-output generation.",
    category: "budget",
    supportsJsonMode: false,
    pricingUsdPerMillion: {
      input: 0.152,
      output: 0.287
    }
  },
  {
    id: "@cf/google/gemma-3-12b-it",
    label: "Gemma 3 12B",
    description: "Alternative medium-weight model for multilingual content experiments.",
    category: "long_context",
    supportsJsonMode: false,
    pricingUsdPerMillion: {
      input: 0.35,
      output: 0.56
    }
  },
  {
    id: "@cf/google/gemma-4-26b-a4b-it",
    label: "Gemma 4 26B",
    description: "Experimental option currently seen in source projects.",
    category: "experimental",
    supportsJsonMode: false,
    pricingUsdPerMillion: {
      input: 0.1,
      output: 0.3
    }
  }
];

export const defaultSeoModelId =
  seoModelOptions.find((item) => item.recommended)?.id ?? seoModelOptions[0].id;
