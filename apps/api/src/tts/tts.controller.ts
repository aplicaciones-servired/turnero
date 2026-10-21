import { BadRequestException, Controller, Get, Query, Res } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import type { Response } from "express";

@Controller("tts")
export class TtsController {
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Get()
  async tts(
    @Query("text") text: string,
    @Query("tl") tl: string = "es",
    @Res() res: Response
  ) {
    const raw = (text ?? "").trim();
    if (!raw) throw new BadRequestException("text requerido");
    if (raw.length > 400) throw new BadRequestException("texto demasiado largo");

    const q = encodeURIComponent(raw);
    const ua =
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0";

    const url = `https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=${tl}&q=${q}`;
    try {
      const r = await fetch(url, {
        headers: {
          "User-Agent": ua,
          Referer: "https://translate.google.com/",
        },
      });
      if (!r.ok) {
        res.status(502).end();
        return;
      }
      const buf = Buffer.from(await r.arrayBuffer());
      res.setHeader("Content-Type", "audio/mpeg");
      res.setHeader("Cache-Control", "public, max-age=3600");
      res.send(buf);
    } catch {
      res.status(502).end();
    }
  }
}
