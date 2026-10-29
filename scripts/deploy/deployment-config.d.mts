type Environment = Record<string, string | undefined>;
declare const config: {
  origin(value: string | undefined, name: string, allowHttp?: boolean): URL;
  deployment(env?: Environment): {
    mode: string; required: boolean; secret: string; publicUrl: URL | null;
  };
  gatewayConfig(env?: Environment, allowHttp?: boolean): {
    backend: URL; publicUrl: URL; secret: string;
  };
  sameSecret(actual: string | undefined, expected: string): boolean;
};
export default config;
export const deployment: typeof config.deployment;
export const gatewayConfig: typeof config.gatewayConfig;
export const sameSecret: typeof config.sameSecret;
export const origin: typeof config.origin;
