import {
  Context,
  DdcOptions,
  Item,
  SourceOptions,
} from "jsr:@shougo/ddc-vim@~9.1.0/types";
import { BaseSource } from "jsr:@shougo/ddc-vim@~9.1.0/source";

import type { Denops } from "jsr:@denops/core@~7.0.0";
import * as fn from "jsr:@denops/std@~7.4.0/function";
import * as op from "jsr:@denops/std@~7.4.0/option";
import * as vars from "jsr:@denops/std@~7.4.0/variable";

type Params = {
  limit: number;
  paths: string[];
};

export class Source extends BaseSource<Params> {
  override async gather(args: {
    denops: Denops;
    context: Context;
    options: DdcOptions;
    sourceOptions: SourceOptions;
    sourceParams: Params;
    completeStr: string;
  }): Promise<Item[]> {
    let histories: string[] = [];
    for (const path of args.sourceParams.paths) {
      const expandedPath = await fn.expand(args.denops, path) as string;
      histories = histories.concat(
        (await getHistory(expandedPath, args.sourceParams.limit)).reverse(),
      );
    }

    let input = args.context.input;
    if (args.context.mode !== "c") {
      const filetype = await op.filetype.getLocal(args.denops);
      if (
        filetype === "deol" && await fn.exists(args.denops, "*deol#get_input")
      ) {
        input = await args.denops.call("deol#get_input") as string;
      }

      const uiName = await vars.b.get(args.denops, "ddt_ui_name", "");
      if (uiName.length > 0 && await fn.exists(args.denops, "*ddt#get_input")) {
        input = await args.denops.call("ddt#get_input", uiName) as string;
      }
    }

    const inputLength = input.length - args.completeStr.length;
    const filterInput = input.substring(0, inputLength);
    return histories.filter((word) => word.startsWith(filterInput))
      .map((word) => ({ word: word.substring(inputLength) }));
  }

  override params(): Params {
    return {
      limit: 500,
      paths: [],
    };
  }
}

async function getHistory(path: string, limit: number): Promise<string[]> {
  const stat = await safeStat(path);
  if (!stat) {
    return [];
  }

  const decoder = new TextDecoder("utf-8");
  const data = await Deno.readFile(path);
  const lines = decoder.decode(data).split("\n");

  const commands = lines.map((line) => {
    const match = line.match(/^: \d+:\d+;(.*)/);
    return match ? match[1] : line;
  }).filter((cmd) => cmd !== "");

  function uniq(arr: string[]): string[] {
    const seen = new Set<string>();
    return arr.filter((item) => {
      if (seen.has(item)) {
        return false;
      } else {
        seen.add(item);
        return true;
      }
    });
  }

  return uniq(commands).slice(-limit);
}

const safeStat = async (path: string): Promise<Deno.FileInfo | null> => {
  // NOTE: Deno.stat() may be failed
  try {
    const stat = await Deno.lstat(path);
    if (stat.isSymlink) {
      try {
        const stat = await Deno.stat(path);
        stat.isSymlink = true;
        return stat;
      } catch (_: unknown) {
        // Ignore stat exception
      }
    }
    return stat;
  } catch (_: unknown) {
    // Ignore stat exception
  }
  return null;
};
