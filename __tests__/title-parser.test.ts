import { describe, expect, test } from 'bun:test'
import { extractSeasonNumber } from '../src/lib/title-parser'

describe('extractSeasonNumber', () => {
  const cases: [string, number][] = [
    // 第N期
    ['犬夜叉 第2期', 2],
    ['転生したらスライムだった件 第3期', 3],
    ['犬夜叉　第4期', 4],
    ['呪術廻戦 死滅回游 前編（第3期）', 3],
    ['Dr.STONE SCIENCE FUTURE（第4期）', 4],
    ['BEASTARS(第2期)', 2],
    // シーズンN
    ['ダンジョン飯 シーズン2', 2],
    ['チャギントン（シーズン4）', 4],
    ['ヤンキーハムスター シーズン4', 4],
    ['トニカクカワイイ(シーズン2)', 2],
    // Season N / SeasonN
    ['Re:ゼロから始める異世界生活 Season 2', 2],
    ['Dr.STONE Season2', 2],
    ['SPY×FAMILY Season 3', 3],
    ['盾の勇者の成り上がり Season 4', 4],
    ['魔法使いの嫁 SEASON 2', 2],
    ['ヴィンランド・サガ SEASON 2', 2],
    ['Helluva Boss - Season 2', 2],
    ['Invincible - Season 3', 3],
    // Nth Season / Nth season
    ['メイドインアビス 2nd Season', 2],
    ['モブサイコ100 3rd Season', 3],
    ['シャングリラ・フロンティア 2nd Season', 2],
    ['百姓貴族 2nd Season', 2],
    ['自動販売機に生まれ変わった俺は迷宮を彷徨う 2nd season', 2],
    ['フルーツバスケット 2nd season', 2],
    ['Re:ゼロから始める異世界生活 3rd season', 3],
    ['ありふれた職業で世界最強 season 3', 3],
    ['TVアニメ『MFゴースト 3rd Season』', 3],
    // N期 (数字+期)
    ['東京喰種:re 2期', 2],
    ['ラブライブ！虹ヶ咲学園スクールアイドル同好会TVアニメ2期', 2],
    ['ラブライブ！スーパースター!!TVアニメ3期', 3],
    // Nthシーズン (スペースなしカタカナ)
    ['赤髪の白雪姫 2ndシーズン', 2],
    ['ワールドトリガー 3rdシーズン', 3],
    ['ワールドトリガー 2ndシーズン', 2],
    // Nth SEASON (大文字)
    ['マギアレコード 魔法少女まどか☆マギカ外伝 2nd SEASON -覚醒前夜-', 2],
    // Nth (序数のみ、末尾)
    ['ソードアート・オンライン 1st Season', 1],
    ['オーバーロード 4th Season', 4],
    ['真の仲間じゃないと勇者のパーティーを追い出されたので、辺境でスローライフすることにしました 2nd', 2],
    // N期～ (波線付き)
    ['あはれ! 名作くん 2期～', 2],
    // SeasonN (スペースなし・括弧等)
    ['逆転裁判 ～その「真実」、異議あり!～Season 2', 2],
    ['『キン肉マン』完璧超人始祖編Season 2', 2],
    // Nth Season + サブタイトル
    ['ようこそ実力至上主義の教室へ 4th Season 2年生編1学期', 4],
    // マッチしないケース (デフォルト 1)
    ['呪術廻戦', 1],
    ['ワンピース', 1],
    ['SPY×FAMILY', 1],
    ['86―エイティシックス―', 1],
    ['転生したら第七王子だったので、気ままに魔術を極めます', 1],
    ['攻殻機動隊 S.A.C. 2nd GIG', 1],
    ['BUZZER BEATER 2nd Quarter', 1],
    ['イジらないで、長瀞さん 2nd Attack', 1]
  ]

  for (const [title, expected] of cases) {
    test(`"${title}" → ${expected}`, () => {
      expect(extractSeasonNumber(title)).toBe(expected)
    })
  }
})
