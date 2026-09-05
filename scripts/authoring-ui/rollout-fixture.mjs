// Slice V0 fixture：按 2026-08-29 可见切片计划 §6 装载《雾港纪事》本地虚构数据。
// 只通过正式 repository / store / schema 模块写入 localStorage，不新建业务 mock store。
// 用法：BASE=http://127.0.0.1:5173 node scripts/authoring-ui/rollout-fixture.mjs
import { chromium } from 'playwright'
import fs from 'node:fs'
import path from 'node:path'

const BASE = process.env.BASE || 'http://127.0.0.1:5173'
const OUT_DIR = path.resolve('tmp/authoring-rollout')
fs.mkdirSync(OUT_DIR, { recursive: true })

const ch1 = [
  '雾在黄昏时涨得最快。等莉娜数完第三盏航灯，码头石阶已经只剩顶端一线，像谁用指甲在海面上轻轻划了一道，又立刻抹去。她合上抄表册，把铅笔别回耳后，沿着湿滑的栈桥往回走。',
  '抄表员的工作说不上体面，却有一套谁也不敢破坏的规矩：黄昏起雾时数航灯，灯亮一盏记一盏，灯灭一盏也记一盏。二十年，七千多个黄昏，莉娜的记录从来没有断过一天。',
  '旧港的钟楼在雾里敲了七下。前六下都短促干脆，第七下却拖得很长，像有人按住了钟舌不肯放手，又像雾本身粘住了铜的声音，把它在半空里抻成一条细线。',
  '莉娜停下来。她记得清清楚楚，钟楼的钟三年前就裂了。裂缝从钟肩一直贯到钟口，修钟的匠人说这口钟这辈子都不会再响，城里的簿册上也早就把它除了名。',
  '更奇怪的是灯塔。塔顶的灯没有转，光柱钉在同一个方向，直直指着海湾深处的黑石礁。雾那么浓，光却一寸也不肯让出去，把通往礁石的水路照出一条惨白的走廊。',
  '“魔力异常。”她对着抄表册念了一遍，又觉得这四个字太轻，配不上眼前的景象。可抄表册上只有这么一栏。规矩里没有给“钟自己响了”留位置，也没有给“雾里站着东西”留位置。',
  '海面上浮起一层细碎的磷光。起初只有硬币大小，一片、两片，像有人从水底往上递灯笼；随后连成一片，把整个内港照成惨白，连栈桥的木纹都看得一清二楚。',
  '有渔夫从雾里跑出来，蓑衣上淌着水，草鞋跑丢了一只也不觉得。他嘴里反复念叨着同一句话：石柱，石柱又亮了。经过莉娜身边时，他甚至没有看她一眼。',
  '莉娜跟着人群往旧港深处去。石柱立在税务所后的空场上，是这座城最老的东西。传说它比税务所老，比城墙老，比“雾港”这个名字还要老。没有谁知道它是什么时候立起来的，只知道每年修城图的人都会把它重新画上去，一笔不敢少。',
  '此刻石柱表面的刻痕正一道道亮起来。那不是火光，也不是磷光，更像有人用指尖在黑暗里描摹一幅极旧的星图，描到哪一道，哪一道就醒过来，发出一种介于琥珀与旧黄铜之间的颜色。',
  '人群围着石柱，却没有人敢靠得太近。孩子们被大人攥着手腕往回拖，狗夹着尾巴钻进板车底下。磷光映在每一张仰起的脸上，把皱纹和瞳孔都照得清清楚楚。',
  '莉娜挤到前排时，光正好熄灭。石柱暗下去的那一瞬，她听见极轻的一声，像叹息，又像很远的地方有人合上了一本很厚的书。她下意识看向四周，没有人露出听见了什么的表情。',
  '巡夜的卫兵开始驱赶人群。铁皮灯笼在雾里晃出一个个模糊的圆。莉娜退到税务所的墙根下，后背贴着还带着白日余温的石头，抄表册的封皮被冷汗浸软了。',
  '回家的路上她数了七次心跳，雾才重新合拢。灯塔的光柱又开始转动，一圈，又一圈，若无其事，仿佛刚才那半个时辰的凝滞从来没有发生过。只有抄表册上被她攥出的褶皱提醒她：今晚不一样。',
  '那晚她在灯下补完抄表册。写“钟声”不行，钟没有响；写“磷光”不行，规矩里也没有这一栏。她把“魔力异常”四个字划掉，改成“灯光延迟”，笔画稳得连她自己都佩服。',
  '划掉之后她又后悔了。抄表员的职责是记录，不是解释——这是她入行第一天师父说的话。解释是所长的事，是簿册的事，不是一支铅笔的事。她重新把四个字一笔一画描了回去。',
  '描字的时候笔尖顿了一下，在“异”字的最后一捺上洇开一个小小的墨点，像一颗不肯落下的星。她盯着那个墨点看了很久，最后合上册子，用麻绳把它捆紧，塞进床底的木箱。',
  '她不知道的是，同一个时辰，税务所的顶楼还亮着另一盏灯。灯下坐着一个她明天就会见到的人，那人面前摊着一册空白的簿子，笔尖悬了很久，一个字也没有落下去。'
].join('\n\n')

const ch2 = [
  '艾德加把最后一册税册归档时，窗外的雾已经浓得化不开。灯焰在穿堂风里伏了一下，又立起来。他扶着架子缓了缓——三十一年了，档案室的每一级台阶他都闭着眼能走，可今夜膝盖沉得反常，像有人往他的靴筒里灌了铅。',
  '他在税务所做了三十一年文书。入所第一天，他的师父带他站在这排架子前说：账册比人可靠，人会说谎，册子只会蒙灰。三十一年，他把这句话过成了日子：每天酉时三刻封册，戌时归档，亥时锁柜，风雨无改。',
  '但今夜第三排第七格是空的。那本该是嘉禾十七年的船税总册——蓝布函套，四百二十一页，函套右下角有一块他亲手补过的浆糊印。他记得它入格的那天，也记得自己上一旬查档时它还在原位，安安静静，和三十六个邻居挤在同一层。',
  '他把灯芯捻亮，又数了一遍。确实空了。空格里的灰尘完好无损，均匀，细腻，像从来没人放过东西。取书的人甚至没有留下指尖的痕迹——这不是偷，偷会乱灰；这是取档，按规矩取档。可登记簿上一夜之间没有任何新条目。',
  '艾德加在空格前站了很久。灯焰把他和空格一起照在墙上，投出一个佝偻的影子和一个方正的洞。然后他做了一件他三十一年来从没做过的事——他没有上报。他吹熄了灯，在黑暗里把架门锁好，钥匙收回贴身的内袋，像每一个平常的夜晚一样。'
].join('\n\n')

const ch3 = [
  '第二天清晨，莉娜被叫进税务所。',
  '所长的办公室在二楼，百叶窗把晨光切成一条条，铺在堆满卷宗的长桌上。',
  '“昨夜的记录呢？”所长头也不抬。',
  '莉娜把抄表册放到桌上，翻到画着墨点的那一页。',
  '所长只扫了一眼就把册子合上了，动作快得像烫手。“这一页不许存在。”',
  '“可钟……”',
  '“钟没有响。”所长的声音平得像退潮后的滩涂，“灯塔一切正常。明白吗？”',
  '莉娜不明白。但她学会了在旧港生存的第一课：有些话要说第二遍才作数。',
  '“灯塔一切正常。”她重复道。',
  '出门时她撞见艾德加抱着一摞新册子上楼。老人的指节上有新鲜的墨渍，眼睛里全是血丝。',
  '两人擦肩而过，谁也没有停下。旧港的人擅长装作彼此不存在。'
].join('\n\n')

const ch4 = [
  '接下来的七天，雾港平静得反常。',
  '钟不再响，磷光没有再出现，石柱的刻痕暗得和三十年前一样。',
  '莉娜几乎要说服自己那晚是疲劳的错觉，直到第八天，潮水没有来。',
  '低潮线一夜之间退出了防波堤的视距，露出从未见过天日的滩涂。',
  '滩涂上全是脚印。人的、鸟的、还有一些谁也叫不出名字的，全都朝着一个方向——黑石礁。',
  '卫兵拉起了警戒线，但脚印在警戒线之前就开始了，又在警戒线之后继续。',
  '所长下令封锁消息。可渔村的谢老太半夜来敲莉娜的窗，塞给她一条风干的小鱼。',
  '“我阿公说过，”老太的声音像砂纸，“石柱亮三次，海就要收一次账。”',
  '“这是第几次？”',
  '谢老太伸出两根枯瘦的手指，顿了顿，又添上第三根。',
  '莉娜想起那声叹息。如果那晚是第三次，账已经收过了——收走的会是什么？',
  '她连夜翻遍抄表册。二十年，七千多个黄昏，她记录的每一盏航灯忽然连成了别的图案。',
  '灯塔延迟的秒数，每年增加一个刻度。不多不少，像某种缓慢的倒计时。',
  '窗外，雾又一次涨了起来。这一次，它涨得比钟声还快。'
].join('\n\n')

const ch5 = [
  '莉娜决定在今晚潜入税务所。这个念头一旦落纸，就再也擦不掉了。她白天照常上班，照常数灯，照常把每一盏的明灭写进抄表册，只是从今天起，她在册子的末页多记了一栏——雾的浓度。八天来，那一栏的数字一天比一天大，而城里的簿册对此只字未提。',
  '她挑了雾最浓的时辰动手。从后巷翻进税务所的院子时，她的手肘擦掉了墙皮上一块青苔，露出一小片被烟熏黑的旧砖。落脚点选在晒纸架的阴影里——税务所每月晒一次誊抄的税单，架子如今空着，湿气顺着麻绳往土里渗。',
  '旧港税务所的后门锁着一把黄铜大锁，锁身磨得发亮。一把常年不用的锁会积绿锈，而这把锁的每一道棱都被手摸得圆润——它每夜都被人开过。莉娜把这个发现也记在心里。她如今记东西不再全靠抄表册了，有些账只能记在脑子里。',
  '她用抄表册的铜夹片撬了三下。第一下试探锁簧的脾气，第二下找到倒齿的空隙，第三下锁舌弹开，声音轻得像一声咳嗽，随即被雾接走。她在门口停了三息，数自己的心跳。没有脚步声。她闪身进去，反手把门掩回原位。',
  '档案室里比外面还冷。三十七排档案架在黑暗中站成一片森林，架上的税册按照年份一层层码上去，最早的一层落着近十年的灰。这里的空气有一种旧纸和墨混合的味道，闻久了，人会错觉时间在这里停了。',
  '莉娜点亮随身的油灯，火苗压得很低，只够照亮眼前一臂的距离。第三排第七格，空的。她数了两遍才敢确认——第三排她数了两次，第七格她把手伸进去摸了一遍，指尖只碰到格底的木板和一层均匀的、从未被扰动过的灰。',
  '“你也在找它？”',
  '身后的声音让她差点碰翻油灯。灯焰猛地一歪，在墙上投出摇晃的巨影。艾德加站在门口，手里提着另一盏灯，灯罩擦得很亮。他不知在那里站了多久，蓑衣上的水珠还没有滴完。',
  '老人的目光越过她，落在那个空格上，停了很久，像在给一块碑文辨认年代。“嘉禾十七年的船税总册。”他说。语气平得像在报一个格子的编号，可莉娜听见他的呼吸在最后三个字上短了一截。',
  '“里面记了什么？”她把油灯往身侧挪了半寸。灯焰照不亮的地方，艾德加的眼睛亮了一下，又暗下去。',
  '“记了账。”艾德加说，“但不是钱的账。”',
  '他在旁边的木凳上坐下，动作很慢，像是终于卸下了背了三十一年的东西。木凳发出一声轻响，在寂静的档案室里显得格外大。他把灯放在脚边，光从下往上照着他脸上的沟壑。',
  '“每一笔船税入港，税务所都要在册子上记两笔。一笔记钱，一笔记账。这是老规矩，比我入所早，比所长入所早，比这座楼的房梁还早。”他伸出一根手指，在虚空中划了两道，“左边那笔交给城库，右边那笔——谁也不交。”',
  '“账？”',
  '“名字。”老人的声音低下去，低到几乎混进雾里，“每条船进港，都要有人用名字作保。作保的人签下名字，船才被允许靠岸。船走了，名字留下。留在总册上，一年一册，一代一摞。”',
  '“签了会怎样？”莉娜听见自己的声音发干。她想起抄表册上那个洇开的墨点，无端端打了个寒噤。',
  '“石柱替海记着。”艾德加抬起头，“星图回应的那几夜，你在场，你听见了。海在催账。刻痕亮一道，海就核一笔。亮满七道，”他停住，换了口气，“亮满七道，海就收账。”',
  '莉娜想起磷光，想起那声像合上厚书的叹息。“催谁的账？”',
  '“签过名的人的。”老人说，“雾港每一代都要还一次。上一代是嘉禾十七年——那本册子记着所有还账的名字。还过账的人，簿册上从此查无此人。不是死了，是从来没存在过。他的船，他的税，他的债，他欠酒馆的两吊钱，全都干干净净，像雾散了。”',
  '“所以册子不能丢。”莉娜慢慢地说。她终于明白那格空架子为什么让一个三十一年从不出错的老文书坐立不安。',
  '“册子不能丢。”艾德加重复了一遍，一字一顿，“更要紧的是，不能让海以为账已经平了。账平了，就不用再催了。不用催，”——他的喉结动了动——“这座城就该雾封十年了。”',
  '莉娜在空格前站直了身子。冷意顺着脊椎爬上来，一节一节，不慌不忙。“是谁拿走的？”',
  '老人沉默了很久，久到油灯的火苗都矮了半寸，灯芯结出一粒焦黑的花。他没有剪。',
  '“三天前，所长调走了那格档案的钥匙。”他终于说，“钥匙一共有两把，一把在我这里，三十一从来没离过身。另一把挂在所长腰上。我教了他三十一年归档，他的手法我认得——取册之前，他先取了登记簿里那一页。”',
  '莉娜在税册的夹层里发现了一枚黄铜钥匙。它就压在艾德加所说的那格锁孔内侧的暗屉缝里，像是有人故意留给她的——不，她想，是故意留给“会来数格子的人”的。钥匙比后门那把小一圈，齿口是新锉的，还带着黄铜的亮。',
  '钥匙柄上刻着一小片星图。七颗星，一颗不多，一颗不少，连成的形状正是石柱上的刻痕。第七颗星的位置有一个针尖大的凹点，像被人用锥子狠狠扎过一下。',
  '“他不是在藏册子。”艾德加盯着钥匙，瞳孔缩成一点，“他是在还账。用整本册子的名字。嘉禾十七年，两百一十七个名字——他把他们一次全还回去了。”',
  '楼上传来百叶窗合拢的声音，很轻，但在这样的寂静里像一声枪响。两人同时熄了灯。黑暗涌上来，把三十七排档案架重新收进夜里。',
  '黑暗里，莉娜听见自己的心跳，一下，两下，像退潮时搁浅的水拍着堤岸。她数到第七下，楼上没有脚步声。第八下，艾德加的手在黑暗里碰了碰她的手肘，朝门的方向指了指。',
  '离开档案室之前，她做了这辈子最违反规矩的一件事：把那枚黄铜钥匙揣进了怀里。抄表员的职责是记录，不是解释，更不是介入。可是从今夜起，她的抄表册上又多了一栏——她自己也说不清那一栏该叫什么名字。',
  '而在城市的另一头，石柱的第七道刻痕，无声地亮了一瞬。',
  '同一个时辰，灯塔的光柱停了整整七秒。守塔人打着瞌睡，什么也没有记下来。第二天的抄表册上，这一夜将会是一片干净得可疑的空白，只有末页那一栏雾的浓度，还在固执地变大。',
  '回到阁楼时天还没亮。莉娜把钥匙压在抄表册的最底下，上面摞了七本旧册子。她躺下，闭上眼，眼前却全是那两百一十七个名字——他们曾经买过鱼，骂过孩子，在冬夜里互相借过半筐炭。现在他们是两册纸。',
  '她睡着前想的最后一件事是：所长要还的账已经还了，海也收了。可账上还剩多少名字？下一本总册里，签着的是谁？',
  '窗外，涨起来的雾贴着玻璃慢慢流动，像一只巨大的手，在为这座城市翻到下一页。',
  '第二天上午，所里的差役果然来了。他站在阁楼楼梯下不肯上来，只朝上喊了一句话：所长请你去一趟。声音不大，整条巷子却都听见了。莉娜下楼的时候，把抄表册留在了床上——她如今知道，有些册子不能带进税务所。',
  '所长的办公室窗明几净，百叶窗里的光比记忆里亮。桌上没有卷宗，只有一壶茶，两只杯，和一册崭新的簿子。簿子的封皮还是白的，白得像刚落下的雪，还没有沾上一个数字。',
  '“昨夜睡得好吗？”所长问。他给两只杯都倒了茶，却把其中一只推到自己面前。',
  '“数灯数得晚。”莉娜说。她没有坐。规矩里没有教她这种时候该不该坐。',
  '“灯要数。”所长点头，语气温和得像在夸奖，“雾也要数。你做得对。塔上的灯延迟了，不是你的错，是灯芯受了潮。”他伸手，把那册白簿子转了半圈，推向她这一侧，“这是新总册。嘉禾十八年。”',
  '“旧册呢？”莉娜问出口的瞬间就知道自己错了。抄表员不该问册子，册子问不问人，都轮不到抄表员开口。',
  '所长抬起眼皮看她。那目光很轻，却像秤钩，把她从头到脚约了一遍。“旧册是废册。”他说，“账目年年结转，旧页自然作废。雾港的规矩，你比谁都熟。”',
  '莉娜垂下眼。就在垂眼的那半息里，她看见所长腰间挂着两把钥匙。一把是后门的黄铜大锁，另一把小一圈，齿口的方向朝内——新锉的黄铜在窗光下亮了一下，快得像错觉。',
  '“还有一件事。”所长把白册子又推近一寸，“今年的作保，你的名字也在列。”',
  '“抄表员要给谁作保？”',
  '“给雾。”所长端起自己那杯茶，吹了吹浮沫，“今年雾大，港务的账要有人担着。签吧。签了，你就还是旧港的人。”',
  '“不签呢？”话一出口，莉娜就后悔了。这是她二十年来第一次在税务所里说“不”。',
  '所长没有生气。他甚至笑了笑，把茶杯放下，杯底和桌面碰出一声很轻的响。“不签也行。”他说，“灯总要有人数，雾总要有人记。只是从明天起，数灯的差事就换年轻眼睛来做。你二十年了，眼睛也该歇歇了。”',
  '窗外有一艘船正在进港，汽笛拖得很长。莉娜数着自己的心跳：一下，两下——她忽然发现自己在害怕的已经不是石柱，也不是海。是这支笔。笔一旦放下了，她在这座城里就只剩一个名字，还挂在别人的簿子上。',
  '名字一栏已经用小楷填好了：莉娜。两个字端正，饱满，一笔不苟，像刻上去的。她盯着自己的名字看了很久，忽然发现笔画之间有一道极细的划痕——有人先写过别的名字，又用刀尖刮掉了。刮痕很浅，但在白纸黑字之间，它比任何字都刺眼。',
  '她没有签，也没有说不签。她说，容我想一夜。所长说，好，明天的雾会很合适。她听懂了这句话里没有说出来的那一半：雾很合适，收账的天气也很合适。',
  '回到阁楼，她把怀里的钥匙取出来，摆在窗台上。星图的第七颗星在晨光里微微发亮，那个针尖大的凹点对着她，像一个还没有睁开的眼。她想起艾德加的话：不能让海以为账已经平了。可是现在，账上又多了一个名字——是她自己的。'
].join('\n\n')

const chapters = [
  { id: 'fogch-1', title: '魔力异常', markdown: ch1 },
  { id: 'fogch-2', title: '灯下空格', markdown: ch2 },
  { id: 'fogch-3', title: '不许存在的一页', markdown: ch3 },
  { id: 'fogch-4', title: '低潮线', markdown: ch4 },
  { id: 'fogch-5', title: '星图回应', markdown: ch5 }
]

const explorations = [
  {
    title: '未编排速记',
    content: [
      '# 未编排速记',
      '',
      '- 钟楼第七响拖长：钟舌被按住？还是雾在传声时被截断？',
      '- 灯塔延迟秒数每年 +1 刻度 → 倒计时单位是什么？十年？一代？',
      '- 谢老太的鱼干：渔村是否早就知道“收账”的规律？',
      '- 所长调钥匙的时间点：三天前 = 低潮线出现之前。他先知道？',
      '- 黑石礁的脚印没有任何回程。收走的“账”去了哪里？'
    ].join('\n')
  },
  {
    title: '莉娜视角：七次心跳',
    content: [
      '# 莉娜视角：七次心跳',
      '',
      '抄表员的纪律是：先数数，再害怕。那晚她数了七次心跳，雾才合拢；',
      '今夜她数到第四次，油灯的火苗就开始往艾德加的方向偏。',
      '她忽然明白自己不是在害怕税务所——她是在害怕抄表册上那个墨点，',
      '害怕它替她记下她不敢承认的事：她早就发现灯塔的延迟了，比所长早两年。',
      '她一直没有上报。旧港教会她的第二课是：有些账，人人都欠着。'
    ].join('\n')
  },
  {
    title: '艾德加视角：第三排第七格',
    content: [
      '# 艾德加视角：第三排第七格',
      '',
      '三十一年，他把归档教给所长，把沉默教给自己。',
      '空格出现的第三天他就知道是谁的手笔，但他没有上报——',
      '和莉娜一样，他也有一笔没人知道的账：嘉禾十七年，签保名字的最后一行，',
      '是他替死去的兄长补签的。册子一旦入海，那个名字就会开口。',
      '所以他今晚提着灯站在门口。他必须知道，账上还剩几个名字。'
    ].join('\n')
  }
]

const browser = await chromium.launch()
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 })
const page = await context.newPage()
page.on('pageerror', (err) => console.error('[pageerror]', err.message))
await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(800)

// 先备份现有 localStorage，fixture 可随时回滚。
const backup = await page.evaluate(() => Object.fromEntries(Object.entries(localStorage)))
fs.writeFileSync(path.join(OUT_DIR, 'localStorage-backup.json'), JSON.stringify(backup, null, 2))

const summary = await page.evaluate(async ({ chapters, explorations }) => {
  const booksRepo = await import('/src/services/writing/writingBooksRepository.js')
  const schema = await import('/src/services/writing/writingDocumentSchema.js')
  const docRepo = await import('/src/services/writing/authoringDocumentRepository.js')
  const outlineRepo = await import('/src/services/writing/projectOutlineRepository.js')
  const snaps = await import('/src/services/writing/writingSnapshots.js')
  const annotations = await import('/src/services/writing/writingAnnotations.js')
  const anchorsMod = await import('/src/services/agents/authoring/authoringSceneAnchors.js')
  const snapshotContract = await import('/shared/writingSnapshotContract.js')
  const { useWorldStore } = await import('/src/stores/worldStore.js')

  const worldStore = useWorldStore()
  const wb = await worldStore.createWorldbook({ name: '雾港纪事·设定集' })
  const lina = await worldStore.addEntry(wb.id, {
    name: '莉娜', type: 'character', keys: ['莉娜'],
    content: '旧港抄表员，二十年记录航灯与潮位。纪律是“先数数，再害怕”。第四夜开始追查石柱与灯塔延迟的关联。'
  })
  const edgar = await worldStore.addEntry(wb.id, {
    name: '艾德加', type: 'character', keys: ['艾德加'],
    content: '旧港税务所文书，三十一年归档生涯。嘉禾十七年为亡兄补签作保名字，因此对总册失窃保持沉默。'
  })
  const taxOffice = await worldStore.addEntry(wb.id, {
    name: '旧港税务所', type: 'location', keys: ['税务所', '旧港税务所'],
    content: '石柱后的三层石砌建筑。档案室三十七排架子，第三排第七格是嘉禾十七年船税总册的位置。后门黄铜大锁。'
  })
  const starRule = await worldStore.addEntry(wb.id, {
    name: '星图回应', type: 'rule', keys: ['星图回应'],
    content: '石柱刻痕亮起即“星图回应”：海开始核对作保名字的账。亮三次收一次账，收走的是签名者的存在。',
    injection: { mode: 'constant', probability: 100, cooldown: 0, depth: 2 }
  })

  const book = booksRepo.createWritingBookRecord({ title: '雾港纪事', description: '可见切片验收 fixture（本地虚构数据）', worldbookId: wb.id })
  const now = new Date().toISOString()
  const chapterRecords = chapters.map((chapter) => ({
    id: chapter.id,
    title: chapter.title,
    content: chapter.markdown,
    contentFormat: 'md',
    outlineItems: [],
    wordCount: chapter.markdown.replace(/\s/g, '').length,
    createdAt: now,
    updatedAt: now,
    annotations: [],
    sceneAnchors: [],
    editorDocument: schema.createWritingDocument(chapter.markdown),
    editorDocumentSchemaVersion: 3
  }))
  book.chapters = chapterRecords

  const ch5 = chapterRecords[4]
  const ch5Doc = ch5.editorDocument
  const midUnitIndex = Math.min(5, ch5Doc.content.length - 1)
  const midUnit = ch5Doc.content[midUnitIndex]

  ch5.sceneAnchors = anchorsMod.normalizeSceneAnchors([{
    unitId: midUnit.attrs.unitId,
    worldbookId: wb.id,
    castMode: 'manual',
    presentCharacterIds: [lina.id],
    locationId: taxOffice.id,
    viewpointCharacterId: lina.id,
    time: { label: '入夜前', period: 'evening' },
    // status 字段是失效标记（空 = 有效）；解析器会把任何非空值当作 stale 跳过。
    status: '',
    source: 'fixture'
  }])

  // 首次落盘：此后探索/大纲/批注都经 repository 的 load→mutate→save 增量写入
  booksRepo.saveWritingBooks([book])

  const documents = []
  for (const exploration of explorations) {
    const result = await docRepo.createExplorationDocument(book.id, exploration)
    if (result?.ok) documents.push(result.document)
  }
  // 注意：createExplorationDocument/upsertOutlineNode 内部是 load→mutate→save；
  // 之后绝不能再拿旧 book 对象 saveWritingBooks 整包覆盖，否则探索/大纲被冲掉。

  await outlineRepo.upsertOutlineNode(book.id, {
    title: '星图回应的代价',
    intent: '第五章揭示收账机制：作保名字入海，所长用整本册子还账。',
    status: 'drafted',
    chapterRefs: [ch5.id],
    explorationRefs: documents[1] ? [{ documentId: documents[1].id, role: 'alternative', state: 'proposed' }] : []
  })

  const annotationTargets = []
  for (let unitIndex = midUnitIndex; unitIndex < Math.min(midUnitIndex + 2, ch5Doc.content.length); unitIndex += 1) {
    const unit = ch5Doc.content[unitIndex]
    const node = unit.content[0]
    annotationTargets.push({ unitId: unit.attrs.unitId, unitRevision: unit.attrs.unitRevision, nodeId: node.attrs.nodeId, nodeRevision: node.attrs.nodeRevision })
  }
  const annotationBodies = [
    '雾的描写要与第一章钟声的迟滞感呼应，建议在这里补一个听觉锚点。',
    '艾德加的台词节奏偏快，三十一年文书的口吻应该更短、更钝。'
  ]
  const createdAnnotations = []
  const annotationRecords = []
  annotationTargets.forEach((target, index) => {
    const annotation = annotations.createWritingAnnotation({
      chapterId: ch5.id,
      ...target,
      kind: 'comment',
      body: annotationBodies[index % annotationBodies.length]
    })
    if (annotation) {
      annotationRecords.push(annotation)
      createdAnnotations.push(annotation.id)
    }
  })
  // 批注写入当前存储副本（repository 语义），不用旧对象覆盖
  booksRepo.updateWritingBook(book.id, (fresh) => {
    const target = fresh.chapters.find((chapter) => chapter.id === ch5.id)
    if (target) target.annotations.push(...annotationRecords)
  })

  const snapshotDefs = [
    { label: '第五章·动笔前', reason: 'manual' },
    { label: '低潮线改写前留档', reason: 'before-rewrite' },
    { label: '星图回应第七稿', reason: 'manual' }
  ]
  const savedSnapshots = []
  for (const def of snapshotDefs) {
    const result = snaps.saveWritingSnapshot(snapshotContract.createWritingSnapshot({
      chapterId: ch5.id,
      chapterTitle: ch5.title,
      label: def.label,
      reason: def.reason,
      document: ch5Doc,
      markdown: ch5.markdown,
      annotations: ch5.annotations,
      createdAt: now
    }))
    if (result?.ok) savedSnapshots.push(result.snapshot?.id || 'saved')
  }

  const tabId = 'wt_fixture_fogji'
  // 排版偏好是作者个人设置：fixture 回到出厂默认（中文字体、17px），
  // 避免旧 localStorage 里的等宽栈污染验收截图。
  localStorage.removeItem('writing_typography')
  localStorage.setItem('workspace_tabs_v1', JSON.stringify({
    version: 1,
    tabs: [{
      id: tabId,
      key: `project:${book.id}:authoring`,
      scope: 'project',
      surface: 'authoring',
      projectId: book.id,
      worldbookId: wb.id,
      title: '雾港纪事',
      route: { name: 'authoring', query: { bookId: book.id } },
      pinned: false,
      dirty: false,
      lastActiveAt: Date.now(),
      restoreState: {}
    }],
    activeTabId: tabId
  }))

  return {
    bookId: book.id,
    worldbookId: wb.id,
    chapterWordCounts: chapterRecords.map((chapter) => chapter.wordCount),
    ch5UnitCount: ch5Doc.content.length,
    midUnitIndex,
    midUnitId: midUnit.attrs.unitId,
    midUnitNodeCount: midUnit.content.length,
    explorationIds: documents.map((document) => document.id),
    annotationIds: createdAnnotations,
    snapshotIds: savedSnapshots
  }
}, { chapters, explorations })

fs.writeFileSync(path.join(OUT_DIR, 'fixture-state.json'), JSON.stringify(summary, null, 2))
console.log('[fixture] written:', JSON.stringify(summary, null, 2))

// 快照写入后的完整 localStorage，供后续脚本通过 addInitScript 注入新 context
// （Playwright 每个 context 的 localStorage 都是空的，fixture 必须随脚本重放）。
const storageSnapshot = await page.evaluate(() => Object.fromEntries(Object.entries(localStorage)))
fs.writeFileSync(path.join(OUT_DIR, 'fixture-localstorage.json'), JSON.stringify(storageSnapshot, null, 2))

// 回读验证：重新打开 /authoring?bookId=...，确认真实页面能渲染 fixture。
await page.goto(`${BASE}/authoring?bookId=${summary.bookId}`, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(2500)
const verification = await page.evaluate(() => ({
  title: document.title,
  hasDossier: Boolean(document.querySelector('.wall__dossier')),
  dossierTextLength: (document.querySelector('.wall__dossier')?.textContent || '').length,
  chapterRows: document.querySelectorAll('.authoring-chapter-row').length,
  bodyPreview: (document.querySelector('.wall__dossier')?.textContent || '').slice(0, 120)
}))
console.log('[fixture] verification:', JSON.stringify(verification, null, 2))
fs.writeFileSync(path.join(OUT_DIR, 'fixture-verification.json'), JSON.stringify(verification, null, 2))

await browser.close()
console.log('[fixture] done. backup: tmp/authoring-rollout/localStorage-backup.json')
