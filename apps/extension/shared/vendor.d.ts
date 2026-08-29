declare module "exifr/dist/lite.esm.mjs" {
  const exifr: {
    parse(input: Blob | ArrayBuffer, options?: Record<string, unknown>): Promise<Record<string, unknown> | undefined>;
  };
  export default exifr;
}

declare module "culori/fn" {
  interface RgbColor {
    mode: "rgb";
    r?: number;
    g?: number;
    b?: number;
    alpha?: number;
  }

  interface LabColor {
    mode: string;
    l: number;
    a: number;
    b: number;
    alpha?: number;
  }

  interface LchColor {
    mode: string;
    l: number;
    c: number;
    h?: number;
    alpha?: number;
  }

  export function parseHex(value: string): RgbColor | undefined;
  export function convertRgbToLab65(color: RgbColor): LabColor;
  export function convertRgbToOklab(color: RgbColor): LabColor;
  export function convertLabToLch(color: LabColor, mode?: string): LchColor;
  export function differenceCiede2000(Kl?: number, Kc?: number, Kh?: number): (left: LabColor, right: LabColor) => number;
}
