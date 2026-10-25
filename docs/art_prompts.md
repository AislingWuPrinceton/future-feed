# Felt art for the town

把每张图生成好以后，下载成 PNG，**按下面的文件名**放进 `future-feed/static/art/raw/` 文件夹。放好了跟我说一声，剩下的抠图、切块、拼进小镇都由我来做。

生成小贴士：
- 用 ChatGPT（或任何能出图的工具）都可以，一次发一段提示词。
- 楼和小物件那几张，如果工具有"透明背景"选项就选上。没有的话，纯白背景也行，我来抠。
- 不满意可以让它"再来一张"，挑最像参考图的那张就好。
- 每段提示词最后都已经带上了统一的风格描述，**不要删**，这样每张图的光线和质感才一致。

---

## 1. `background.png` — 背景（横版 1536×1024）

```
A wide landscape diorama made entirely of handmade needle-felted wool, photographed in a soft studio. Pale powder-blue felt sky with a gentle gradient. Several layers of soft rolling felt hills: misty sage-green mountains far away, then a teal-blue hill, then a burnt-orange hill, then a light sage-green hill. The bottom fifth of the image is flat olive-green felt ground with a straight cream-white wool path running horizontally across the whole width. No houses, no trees, no clouds, no people, no text — leave the middle of the scene empty. Soft matte wool fibers with visible fuzz, soft diffused light from the upper left, gentle depth, cozy and calm. Landscape format.
```

## 2–8. 七种楼（每张竖版 1024×1536，透明或纯白背景）

每张图里是**同一栋楼拆开的三块**，从上到下：屋顶、一层"中间楼层"、一层"一楼"。三块要一样宽，中间留空白，这样我可以把中间楼层叠很多层，让楼一层层长高。

先复制这段通用开头，然后在后面接上各栋楼自己的那一句：

```
Three separate pieces of the same handmade needle-felted wool building, front view, arranged vertically with clear empty space between them, all three pieces exactly the same width and perfectly centered: TOP = only the roof, MIDDLE = one plain upper floor (a single storey slice of wall with windows, flat top and bottom edges so it can be stacked), BOTTOM = the ground floor with the front door (flat top edge). Soft matte wool fibers with visible fuzz, cream-white felt walls, small felt windows with pale blue glass, soft diffused studio light from the upper left, orthographic front view, no perspective, isolated on a plain transparent (or pure white) background, no ground, no shadow, no text.
```

各栋楼接上这一句：

| 文件名 | 接在后面的那句 |
|---|---|
| `hall.png` | `This is a small music hall: burnt-orange gabled roof with a round felt window, arched windows, a tiny yellow marquee over the double door.` |
| `library.png` | `This is a small library: sky-blue felt dome roof with a little flag, white columns on the ground floor, tall narrow windows, a wooden door.` |
| `cafe.png` | `This is a small café: mustard-yellow roof with two little chimneys, a red-and-cream striped awning over a big shop window on the ground floor, a teal door.` |
| `home.png` | `This is a small cottage home: burnt-orange pitched roof with a brick chimney, wooden shutters, flower boxes, a brown wooden door.` |
| `gym.png` | `This is a small gym: flat teal roof with a little rooftop running track, big square windows, a glass double door.` |
| `garden.png` | `This is a small greenhouse: rounded sage-green glass-panel roof, lots of window panes, little potted plants by the door.` |
| `studio.png` | `This is a small art studio loft: terracotta brick-red felt walls, charcoal sawtooth roof with skylights, big factory windows.` |

## 9. `scenery.png` — 树、云、太阳等（正方形 1024×1024，透明或纯白背景）

```
A set of separate handmade needle-felted wool miniatures laid out in a neat grid with lots of empty space between every item so none of them touch: three round felt-ball trees on thin brown felt trunks (one mustard-yellow, one burnt-orange, one sage-green), two fluffy white felt clouds, one small round green felt bush with tiny pink felt flowers, one round golden-yellow felt sun, one cream crescent felt moon. Soft matte wool fibers with visible fuzz, soft diffused studio light from the upper left, front view, isolated on a plain transparent (or pure white) background, no shadow, no text.
```

## 10. `room.png` — 楼里每个房间的背景（正方形 1024×1024）

```
A tiny cozy room interior made of handmade needle-felted wool, seen straight on like a dollhouse cutaway: warm cream felt back wall, a small round rug on a wooden felt floor, a little window with soft light, a tiny potted plant in one corner. The center of the room is empty. Soft matte wool fibers with visible fuzz, warm soft light, front view, no people, no text.
```
