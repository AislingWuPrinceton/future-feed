# Felt art for the town

把每张图生成好以后，下载成 PNG，**按下面的文件名**放进 `future-feed/static/art/raw/` 文件夹。放好了跟我说一声，剩下的抠图、切块、拼进小镇都由我来做。

生成小贴士：
- 用 ChatGPT（或任何能出图的工具）都可以，一次发一段提示词。
- **每段提示词后面都要接上下面的「统一风格」那一段**，这样所有图的光线、颜色、毛毡质感才一致，拼在一起才像同一个小世界。
- 楼和小物件那几张，如果工具有"透明背景"选项就选上。没有的话，纯白背景也行，我来抠。
- 不满意可以让它"再来一张"，挑最像参考图的那张就好。
- 时间不够就先做标了 ⭐ 的，其余的有空再补。缺哪张，页面就继续用现在画的版本，不会坏。

### 统一风格（每段提示词后面都接上这段）

```
Style: handmade needle-felted wool miniature diorama, soft matte wool fibers with visible fuzz and tiny stray hairs, slightly irregular handmade shapes, photographed with a macro lens and shallow depth of field (tilt-shift miniature look), soft diffused window light from the upper left, warm muted palette of cream, sage green, teal blue, burnt orange and mustard yellow, cozy and calm, high detail, photorealistic, no text, no letters, no people.
```

---

## 一、小镇大背景（横版 1536×1024）

这几张都是**有远近透视**的背景：近处是一大片平的草地和一条横着的奶白色小路（我们的楼就盖在这条路上，所以这块要空着），往远处有小路弯弯曲曲伸向地平线，有越来越小的树和小房子，最远处是一层层越来越淡的山。

先复制这段**通用开头**，再接上每张图自己的那句，最后接「统一风格」：

```
A wide landscape diorama with deep perspective, camera at eye level just above the ground. FOREGROUND (bottom quarter of the image): a flat felt meadow with a wide cream wool path running straight left to right across the entire width, completely empty, nothing standing on it, so houses can be placed there later. MIDDLE DISTANCE: a smaller path branches off and winds back toward the horizon, getting narrower; little felt-ball trees, a tiny felt river with a wooden bridge, and a few very small distant felt cottages, all getting smaller with distance. FAR DISTANCE: layered rolling felt hills that fade into misty pale mountains, each layer lighter and softer than the one in front (atmospheric perspective). Keep the bottom-center of the image open and uncluttered.
```

| 文件名 | 接在后面的那句 | 什么时候用 |
|---|---|---|
| ⭐ `background.png` | `Season and light: a bright clear morning in late summer, pale powder-blue felt sky, a few soft white felt clouds near the horizon, sage-green meadow, hills in sage green, teal blue and burnt orange.` | 白天（默认） |
| `background_night.png`（旧的晚上图，有雪山，现在只做备用） | `Season and light: a calm night, deep navy-blue felt sky with tiny cream felt stars and a crescent felt moon, the distant cottages have warm glowing yellow windows, everything in soft blue moonlight.` | 点太阳切到晚上时 |
| `background_sunset.png` | `Season and light: golden hour sunset, peach and rose felt sky, a low round orange felt sun near the horizon, long soft warm light across the meadow.` | 傍晚 |
| `background_autumn.png` | `Season and light: crisp autumn afternoon, felt-ball trees in mustard yellow, burnt orange and rust red, a few fallen felt leaves on the meadow, tiny pumpkins near a distant cottage.` | 9–11 月 |
| `background_winter.png` | `Season and light: snowy winter morning, everything covered in soft white wool snow, pale grey-blue sky, small felt pine trees, smoke curling from distant chimneys.` | 12–2 月 |
| `background_spring.png` | `Season and light: early spring, soft pink felt cherry-blossom trees, fresh light-green meadow with tiny white and yellow felt flowers, pastel sky.` | 3–5 月 |
| `background_spring_night.png` | `Season and light: a calm spring night, deep navy felt sky with tiny cream felt stars, pink cherry-blossom trees in soft moonlight, distant cottages with warm glowing yellow windows.` | 春天晚上 |
| `background_summer_night.png` | `Season and light: a warm summer night, deep navy felt sky with tiny cream felt stars and a few glowing fireflies, green hills with no snow, distant cottages with warm glowing yellow windows.` | 夏天晚上 |
| `background_autumn_night.png` | `Season and light: a calm autumn night, deep navy felt sky with tiny cream felt stars, mustard and rust felt-ball trees in soft moonlight, little pumpkins, distant cottages with warm glowing yellow windows.` | 秋天晚上 |
| `background_winter_night.png` | `Season and light: a quiet snowy winter night, deep navy felt sky with tiny cream felt stars, everything covered in soft white wool snow glowing blue in the moonlight, distant cottages with warm glowing yellow windows.` | 冬天晚上 |

> 春、夏、秋、冬的晚上那四张，现在是用 `scripts/make_nights.py` 从白天的图调出来的。想换成真正生成的图，就按上表的名字放进 raw/，再跑 `scripts/slice_art.py`。

---

## 二、楼（每张竖版 1024×1536，透明或纯白背景）

> 想加新款式：按下面的格式生成，起一个英文小写文件名（如 `bookshop.png`）放进 raw/，跑 `scripts/slice_art.py`，它就会自动出现在"选楼的款式"里。房间同理：`room_<名字>.png`（比如 `room_attic.png`）会自动出现在"Decorate this room"里。

每张图里是**同一栋楼拆开的三块**，从上到下：屋顶、一层"中间楼层"、一层"一楼"。三块要一样宽，中间留空白，这样我可以把中间楼层叠很多层，让楼一层层长高。

先复制这段通用开头，然后接上各栋楼自己的那一句，最后接「统一风格」：

```
Three separate pieces of the same handmade needle-felted wool building, arranged vertically with clear empty space between them, all three pieces exactly the same width and perfectly centered: TOP = only the roof, MIDDLE = one plain upper floor (a single storey slice of wall with windows, flat horizontal top and bottom edges so it can be stacked), BOTTOM = the ground floor with the front door (flat top edge). Camera straight on at eye level, showing a little of the right side wall for depth, but top and bottom edges stay perfectly horizontal. Cream-white felt walls, small felt windows with pale blue glass. Isolated on a plain transparent (or pure white) background, no ground, no shadow.
```

| 文件名 | 接在后面的那句 |
|---|---|
| ⭐ `library.png` | `This is a small library: sky-blue felt dome roof with a little flag, white columns on the ground floor, tall narrow windows, a wooden door.` |
| ⭐ `cafe.png` | `This is a small café: mustard-yellow roof with two little chimneys, a red-and-cream striped awning over a big shop window on the ground floor, a teal door.` |
| ⭐ `studio.png` | `This is a small art studio loft: terracotta brick-red felt walls, charcoal sawtooth roof with skylights, big factory windows.` |
| ⭐ `hall.png` | `This is a small music hall: burnt-orange gabled roof with a round felt window, arched windows, a tiny yellow marquee over the double door.` |
| `home.png` | `This is a small cottage home: burnt-orange pitched roof with a brick chimney, wooden shutters, flower boxes, a brown wooden door.` |
| `gym.png` | `This is a small gym: flat teal roof with a little rooftop running track, big square windows, a glass double door.` |
| `garden.png` | `This is a small greenhouse: rounded sage-green glass-panel roof, lots of window panes, little potted plants by the door.` |

---

## 三、街上的小东西（正方形 1024×1024，透明或纯白背景）

每个小物件之间一定要**留大空白、互不接触**，我才能一个个切开。

| 文件名 | 提示词（后面接「统一风格」） |
|---|---|
| ⭐ `scenery.png` | `A set of separate needle-felted wool miniatures laid out in a neat grid with lots of empty space between every item so none of them touch: three round felt-ball trees on thin brown felt trunks (one mustard-yellow, one burnt-orange, one sage-green), two fluffy white felt clouds, one small round green felt bush with tiny pink felt flowers, one round golden-yellow felt sun, one cream crescent felt moon. Front view, isolated on a plain transparent (or pure white) background, no shadow.` |
| `scenery2.png` | `A set of separate needle-felted wool street miniatures laid out in a neat grid with lots of empty space between every item so none of them touch: a little street lamp, a wooden park bench, a red mailbox, a short white picket fence section, a flower pot with tulips, a fluffy white sheep, a small bicycle, a sleeping orange cat, a hot-air balloon with a striped felt envelope. Front view, isolated on a plain transparent (or pure white) background, no shadow.` |

---

## 四、楼里的房间（正方形 1024×1024）

点进楼以后，每次打卡就是一间房。每种楼都有自己风格的房间，**后墙正中挂一个空相框**，我会把那天的明信片照片放进相框里。

先复制这段通用开头，再接每个房间自己的那句，最后接「统一风格」：

```
A dollhouse cutaway of one tiny cozy room, seen straight on, the room fills the whole square frame: back wall, left and right side walls in gentle one-point perspective, and the floor. A large EMPTY cream picture frame (plain cream inside, nothing in it) hangs perfectly centered on the back wall and takes up the upper-middle third of the image. Keep the area directly in front of and below the frame uncluttered; put furniture along the sides.
```

| 文件名 | 接在后面的那句 | 用在哪 |
|---|---|---|
| ⭐ `room_library.png` | `A reading nook: tall wooden bookshelves full of tiny felt books on both sides, a mustard armchair, a little reading lamp, a stack of books and a sleeping cat on a round rug, sky-blue walls.` | 图书馆 |
| ⭐ `room_cafe.png` | `A little café corner: a wooden counter with a tiny espresso machine, cups and pastries under a glass dome, hanging plants, a small round table with two chairs, mustard-yellow and cream walls.` | 咖啡馆 |
| ⭐ `room_studio.png` | `An art studio: a wooden easel, jars of paintbrushes, colorful paint pots, canvases leaning on the wall, a paint-splattered rug, terracotta walls, a big factory window.` | 画室 |
| ⭐ `room_hall.png` | `A music room: a tiny upright piano, a guitar on a stand, a music stand with sheet music, a record player, a cozy rug, warm burnt-orange walls.` | 音乐厅 |
| `room_home.png` | `A bedroom: a small bed with a patchwork quilt, a nightstand with a lamp, a window with cream curtains, slippers on a round rug, soft peach walls.` | 小屋 |
| `room_gym.png` | `A home gym: a rolled yoga mat, small dumbbells on a rack, a jump rope, a water bottle, a potted plant, a tall mirror, teal walls.` | 健身房 |
| `room_garden.png` | `A greenhouse room: rows of potted seedlings on wooden shelves, a watering can, hanging ferns, glass-pane walls with soft green light.` | 温室 |
| ⭐ `room_empty.png` | `The room is still empty and waiting for someone to move in: bare cream walls, a small wooden ladder, a paint bucket, a roll of felt, two cardboard moving boxes, soft pale light.` | 还没打卡的空房间 |
| `room_party.png` | `A celebration room: felt bunting across the ceiling, balloons, a little layered cake on a table, confetti on the floor, warm golden light.` | 盖好一层楼的那间（★ 房间） |

---

## 五、特别场景（横版 1536×1024）

用在开场、升级庆祝和"播放你的十年"这些时刻。后面同样接「统一风格」。

| 文件名 | 提示词 | 用在哪 |
|---|---|---|
| `scene_welcome.png` | `A tiny felt traveler figure with a little backpack, seen from behind, standing at the start of a winding cream wool path that leads across rolling felt hills toward a sunny little felt town on a hill in the far distance, morning light, deep perspective, lots of open sky on the right side.` | 开场 / 注册页 |
| `scene_levelup.png` | `A tiny felt construction crane gently lowering a new cream felt floor onto the top of a small felt building, felt confetti dots and colorful bunting in the air, a sunny felt sky, celebratory and joyful, the building centered.` | 盖好新一层楼时 |
| `scene_story.png` | `One long felt road winding from the left to the right through four seasons in one picture: spring blossoms on the left, green summer, golden autumn, snowy winter on the right, tiny felt houses along the road growing taller from left to right.` | "播放你的十年"封面 |
