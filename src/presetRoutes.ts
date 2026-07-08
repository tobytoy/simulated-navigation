/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { RoutePoint } from './types';

export interface PresetRoute {
  id: string;
  name: string;
  description: string;
  checkpoints: RoutePoint[];
}

export const PRESET_ROUTES: PresetRoute[] = [
  {
    id: 'motc_loop',
    name: '都會核心環線 (MOTC Central Taipei Loop)',
    description: '交通部前出發，經過景福門圓環、中山南路、忠孝東路、建國高架快速道路、再回到仁愛路林蔭大道的大型市中心行車環線。包含高架路段與易塞車道路。',
    checkpoints: [
      {
        lat: 25.0384,
        lng: 121.5230,
        streetName: "仁愛路一段 (交通部前)",
        speedLimit: 40,
        instruction: "起點：從交通部出發，沿仁愛路一段向西行駛，靠右進入外側車道",
      },
      {
        lat: 25.0392,
        lng: 121.5186,
        streetName: "景福門圓環 (東門)",
        speedLimit: 30,
        instruction: "進入景福門圓環，由第三出口駛出，往中山南路(往北)行駛",
      },
      {
        lat: 25.0425,
        lng: 121.5189,
        streetName: "中山南路 (台大醫院前)",
        speedLimit: 50,
        instruction: "沿中山南路直行，朝台北車站/忠孝東路方向",
      },
      {
        lat: 25.0458,
        lng: 121.5193,
        streetName: "中山南路 / 忠孝東路口 (監察院前)",
        speedLimit: 40,
        instruction: "右轉進入忠孝東路一段",
      },
      {
        lat: 25.0441,
        lng: 121.5245,
        streetName: "忠孝東路一段 (華山文創旁)",
        speedLimit: 50,
        instruction: "繼續直行，經過華山 1914 創意文化園區，注意前方車多",
      },
      {
        lat: 25.0435,
        lng: 121.5300,
        streetName: "忠孝東路二段 (往新生南路)",
        speedLimit: 50,
        instruction: "沿忠孝東路二段直行，準備在前方路口靠右，接建國高架道路匝道",
      },
      {
        lat: 25.0428,
        lng: 121.5368,
        streetName: "建國高架入口匝道",
        speedLimit: 40,
        instruction: "靠右行駛，匯入建國南北快速道路 (往南向)",
      },
      {
        lat: 25.0385,
        lng: 121.5372,
        streetName: "建國高架道路 (南向)",
        speedLimit: 70,
        isElevated: true,
        instruction: "行經高架路段，速限提升至 70 公里，維持在主線車道",
      },
      {
        lat: 25.0350,
        lng: 121.5375,
        streetName: "建國高架道路 - 仁愛路出口",
        speedLimit: 40,
        instruction: "準備靠右，由仁愛路出口匝道駛離建國高架道路",
      },
      {
        lat: 25.0378,
        lng: 121.5300,
        streetName: "仁愛路三段 (大安森林公園旁)",
        speedLimit: 50,
        instruction: "匯入仁愛路三段快車道，向西朝總統府/景福門方向前進",
      },
      {
        lat: 25.0382,
        lng: 121.5250,
        streetName: "仁愛路二段 (往紹興南街)",
        speedLimit: 50,
        instruction: "沿仁愛路二段林蔭大道直行，前方 300 公尺即將抵達交通部",
      },
      {
        lat: 25.0384,
        lng: 121.5230,
        streetName: "仁愛路一段 (交通部)",
        speedLimit: 40,
        instruction: "抵達目的地：交通部。您的導航旅程已圓滿完成！",
      }
    ]
  },
  {
    id: 'xinyi_elevated',
    name: '信義快捷經貿線 (Xinyi Tech & Elevated Route)',
    description: '從交通部出發，行經熱鬧的信義商圈、台北 101 附近，並經由建國南路與信義路快慢車道系統進行導航演練，回程穿梭於仁愛林蔭大道。',
    checkpoints: [
      {
        lat: 25.0384,
        lng: 121.5230,
        streetName: "仁愛路一段 (交通部)",
        speedLimit: 40,
        instruction: "起點：從交通部出發，行進至杭州南路右轉，再由信義路二段匯入慢車道",
      },
      {
        lat: 25.0328,
        lng: 121.5285,
        streetName: "信義路二段 (東門捷運站)",
        speedLimit: 50,
        instruction: "行駛於信義路慢車道，沿捷運東門站及永康商圈直行",
      },
      {
        lat: 25.0332,
        lng: 121.5374,
        streetName: "信義路三段 (大安森林公園北側)",
        speedLimit: 50,
        instruction: "經過大安森林公園，靠左注意建國高架橋下匯入車流",
      },
      {
        lat: 25.0335,
        lng: 121.5435,
        streetName: "信義路四段 (捷運大安站旁)",
        speedLimit: 50,
        instruction: "繼續沿信義路直行，朝信義計畫區、台北101大樓方向前進",
      },
      {
        lat: 25.0330,
        lng: 121.5645,
        streetName: "信義路五段 (台北 101 跨年廣場前)",
        speedLimit: 40,
        instruction: "靠左準備左轉松智路，進入台北 101 及信義商圈核心區",
      },
      {
        lat: 25.0375,
        lng: 121.5640,
        streetName: "市府路 (台北市政府正門旁)",
        speedLimit: 40,
        instruction: "行經台北市政府前，左轉接仁愛路四段大圓環方向",
      },
      {
        lat: 25.0376,
        lng: 121.5585,
        streetName: "仁愛路四段 (國父紀念館)",
        speedLimit: 50,
        instruction: "行經國父紀念館南側，沿仁愛路四段快車道向西直行",
      },
      {
        lat: 25.0377,
        lng: 121.5488,
        streetName: "仁愛路四段 (敦南大圓環)",
        speedLimit: 30,
        instruction: "緩速進入敦南圓環，由第二出口朝西行駛，接仁愛路三段",
      },
      {
        lat: 25.0378,
        lng: 121.5300,
        streetName: "仁愛路三段 (建國南路口)",
        speedLimit: 50,
        instruction: "直行穿過建國南路林蔭大道，準備減速，前方將靠右",
      },
      {
        lat: 25.0384,
        lng: 121.5230,
        streetName: "仁愛路一段 (交通部)",
        speedLimit: 40,
        instruction: "抵達目的地：交通部。導航圓滿結束！",
      }
    ]
  },
  {
    id: 'dazhi_neihu',
    name: '大直內科水岸快捷線 (Dazhi & Neihu Expressway)',
    description: '一條連結市中心、大直美麗華商圈、堤頂快速道路高架段以及松山區的長途演練路線。包含大直橋跨河段、內科塞車段與堤頂快速道路高架路段。',
    checkpoints: [
      {
        lat: 25.0384,
        lng: 121.5230,
        streetName: "仁愛路一段 (交通部)",
        speedLimit: 40,
        instruction: "出發：從交通部出發，景福門圓環右轉往北接中山南路直行",
      },
      {
        lat: 25.0482,
        lng: 121.5205,
        streetName: "中山北路一段 (長安東路口)",
        speedLimit: 50,
        instruction: "直行穿過忠孝東路口，進入中山北路林蔭大道，靠中線行駛",
      },
      {
        lat: 25.0620,
        lng: 121.5215,
        streetName: "中山北路三段 (民權東路口)",
        speedLimit: 50,
        instruction: "繼續沿中山北路往北，注意右前方上新生高架快速道路標誌",
      },
      {
        lat: 25.0715,
        lng: 121.5262,
        streetName: "新生高架道路北端 (圓山大飯店旁)",
        speedLimit: 50,
        instruction: "注意右側圓山大飯店地標，靠右接北安路向大直方向前進",
      },
      {
        lat: 25.0792,
        lng: 121.5368,
        streetName: "北安路 (自強隧道口前)",
        speedLimit: 50,
        instruction: "靠右行駛避免進入自強隧道，右轉進入大直北安路商圈",
      },
      {
        lat: 25.0782,
        lng: 121.5510,
        streetName: "樂群二路 (萬豪美福飯店路段)",
        speedLimit: 40,
        instruction: "直行於樂群二路，前方即將抵達美麗華摩天輪敬業三路口",
      },
      {
        lat: 25.0832,
        lng: 121.5570,
        streetName: "敬業三路 (美麗華購物中心前)",
        speedLimit: 30,
        instruction: "經過美麗華，準備右轉接堤頂大道一段，匯入快速道路主線",
      },
      {
        lat: 25.0790,
        lng: 121.5685,
        streetName: "堤頂大道快速道路段",
        speedLimit: 70,
        isElevated: true,
        instruction: "靠左匯入快速道路主線，速限提升至 70 公里，往南行駛",
      },
      {
        lat: 25.0565,
        lng: 121.5692,
        streetName: "麥帥二橋高架段 (往南京東路)",
        speedLimit: 50,
        instruction: "靠右行駛駛離快速道路，經麥帥二橋跨越基隆河，準備進入南京東路",
      },
      {
        lat: 25.0518,
        lng: 121.5540,
        streetName: "南京東路四段 (台北小巨蛋前)",
        speedLimit: 50,
        instruction: "沿南京東路四段西行，過小巨蛋前注意公車專用道交會",
      },
      {
        lat: 25.0485,
        lng: 121.5265,
        streetName: "長安東路一段 (天津街口)",
        speedLimit: 45,
        instruction: "左轉中山南路向南行駛，即將返抵交通部",
      },
      {
        lat: 25.0384,
        lng: 121.5230,
        streetName: "仁愛路一段 (交通部)",
        speedLimit: 40,
        instruction: "安全返抵交通部，大直內科水岸環線導航完滿結束！",
      }
    ]
  }
];
