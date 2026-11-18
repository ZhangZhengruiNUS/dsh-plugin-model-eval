import type {BuiltInReference} from './model.ts';
export const builtInReferences: readonly BuiltInReference[] = [
  {
    "summary": {
      "runId": "openai-gpt-6.2-astra-max-light-v1-1",
      "batchId": "built-in-reference",
      "revision": 1,
      "target": {
        "scopeId": "built-in-reference",
        "providerId": "OpenAI",
        "modelId": "gpt-6.2-astra",
        "routeTarget": {
          "state": "unknown"
        },
        "controls": {
          "reasoningEffort": {
            "state": "known",
            "value": "max",
            "source": "override"
          }
        }
      },
      "protocols": {
        "generalId": "general-task-five-original-v1-light",
        "writingId": "work-writing-12-v1",
        "resourceVersion": "task-five-original-v1"
      },
      "generalDefinition": {
        "schema": "task-five-original-v1",
        "tier": "light",
        "label": "轻量 · 62题（评分修订2）",
        "domains": [
          {
            "id": "knowledge",
            "weight": 0.2,
            "itemIds": [
              "knowledge/mmlu-pro/2815",
              "knowledge/model-eval-original-v1/005",
              "knowledge/mmlu-pro/3820",
              "knowledge/model-eval-original-v1/001",
              "knowledge/model-eval-original-v1/006",
              "knowledge/model-eval-original-v1/002",
              "knowledge/mmlu-pro/6796",
              "knowledge/mmlu-pro/4885",
              "knowledge/mmlu-pro/1831",
              "knowledge/mmlu-pro/8445",
              "knowledge/mmlu-pro/5987",
              "knowledge/mmlu-pro/11254",
              "knowledge/mmlu-pro/9052",
              "knowledge/mmlu-pro/2409",
              "knowledge/model-eval-original-v1/003",
              "knowledge/model-eval-original-v1/004",
              "math/olympiad-text-math/2839",
              "math/olympiad-text-math/2676",
              "math/olympiad-text-math/2954"
            ]
          },
          {
            "id": "reading",
            "weight": 0.2,
            "itemIds": [
              "reading/66ebd5125a08c7b9b35e0616",
              "reading/66ed1556821e116aacb1ea14",
              "reading/66f2b676821e116aacb2b27a",
              "reading/66f55d66821e116aacb33734",
              "reading/66f6bcf3bb02136c067c2703",
              "reading/66f96115bb02136c067c541c",
              "reading/66fab4bfbb02136c067c754c",
              "reading/671b13f5bb02136c067d4ee3"
            ]
          },
          {
            "id": "instructions",
            "weight": 0.2,
            "itemIds": [
              "instructions/ifeval/3069",
              "instructions/ifeval/2275",
              "instructions/ifeval/2683",
              "instructions/ifeval/2736",
              "instructions/ifeval/1129",
              "instructions/ifeval/1670",
              "instructions/ifeval/3035",
              "instructions/ifeval/332",
              "instructions/ifeval/3534",
              "instructions/ifeval/1582",
              "instructions/ifeval/127",
              "instructions/ifeval/1619",
              "instructions/ifeval/3188",
              "instructions/ifeval/3204",
              "instructions/ifeval/1040",
              "instructions/ifeval/152",
              "instructions/ifeval/1012",
              "instructions/ifeval/1219",
              "instructions/ifeval/2853",
              "instructions/ifeval/3380"
            ]
          },
          {
            "id": "coding",
            "weight": 0.2,
            "itemIds": [
              "coding/model-eval-original-v1/006",
              "coding/model-eval-original-v1/008",
              "coding/model-eval-original-v1/002",
              "coding/model-eval-original-v1/004",
              "coding/model-eval-original-v1/003",
              "coding/model-eval-original-v1/001",
              "coding/model-eval-original-v1/005",
              "coding/model-eval-original-v1/007"
            ]
          },
          {
            "id": "tools",
            "weight": 0.2,
            "itemIds": [
              "tools/multi_turn_base_39",
              "tools/multi_turn_base_5",
              "tools/multi_turn_base_83",
              "tools/multi_turn_base_148",
              "tools/multi_turn_base_142",
              "tools/multi_turn_base_153",
              "tools/multi_turn_base_196"
            ]
          }
        ],
        "executionPolicy": "long-tasks-first-v1",
        "definitionHash": "0b19d04675b17ced2b4aa5300f7407e92ff6559a2c0422fc94596261a67b03b0"
      },
      "details": "cleared",
      "resumeAllowed": false,
      "tracks": {
        "general": {
          "status": "completed",
          "required": 62,
          "graded": 62,
          "measures": {
            "knowledge": {
              "required": 19,
              "graded": 19,
              "passed": 19,
              "score": 100
            },
            "reading": {
              "required": 8,
              "graded": 8,
              "passed": 6,
              "score": 75
            },
            "instructions": {
              "required": 20,
              "graded": 20,
              "passed": 18,
              "score": 90
            },
            "coding": {
              "required": 8,
              "graded": 8,
              "passed": 8,
              "score": 100
            },
            "tools": {
              "required": 7,
              "graded": 7,
              "passed": 5,
              "score": 71.42857142857143
            }
          },
          "score": 87.28571428571429,
          "answered": 62,
          "completedAt": "2026-11-18T07:02:11.090Z"
        }
      },
      "judges": [],
      "metrics": {
        "tracks": {
          "general": {
            "answer": {
              "calls": 143,
              "failures": 9,
              "usageCoverage": 0.9370629370629371,
              "taskTiming": {
                "schema": "task-duration-v1",
                "required": 62,
                "measured": 62,
                "complete": true,
                "domains": [
                  {
                    "id": "knowledge",
                    "weight": 0.2,
                    "required": 19,
                    "measured": 19,
                    "meanMs": 18346.85753157895
                  },
                  {
                    "id": "reading",
                    "weight": 0.2,
                    "required": 8,
                    "measured": 8,
                    "meanMs": 22337.8557
                  },
                  {
                    "id": "instructions",
                    "weight": 0.2,
                    "required": 20,
                    "measured": 20,
                    "meanMs": 71986.81419499998
                  },
                  {
                    "id": "coding",
                    "weight": 0.2,
                    "required": 8,
                    "measured": 8,
                    "meanMs": 36309.39065
                  },
                  {
                    "id": "tools",
                    "weight": 0.2,
                    "required": 7,
                    "measured": 7,
                    "meanMs": 145896.44791428573
                  }
                ],
                "meanMs": 58975.47319817294
              }
            },
            "judge": {
              "calls": 0,
              "failures": 0,
              "usageCoverage": 0
            },
            "gradingMs": 0
          }
        },
        "activeIntervals": [],
        "incompleteTiming": true
      },
      "createdAt": "2026-11-18T06:36:47.649Z",
      "completedAt": "2026-11-18T07:02:11.090Z"
    },
    "execution": {
      "state": "known",
      "concurrency": 4,
      "callTimeoutMs": 300000,
      "failurePolicy": "output-idle-v1"
    },
    "nativeRun": {
      "schema": "native-run-reference-v1",
      "summarySha256": "43516f4513d56ebcece035a1c79813fec32e2b6380245e75bfe3031ce1fc459c",
      "itemsSha256": "9c9c046edbdc8bc820933ad1b87e54cc4010528e4de4257b2abddf5ff8791c8f",
      "requiredSha256": "406619888fbf14d042522f905f090852969be11519475d3a17fb478449f02175"
    },
    "channel": "ChatGPT 订阅",
    "batchActiveMs": 917143
  },
  {
    "summary": {
      "runId": "openai-gpt-6.2-astra-max-deep-v1-2",
      "batchId": "built-in-reference",
      "revision": 1,
      "target": {
        "scopeId": "built-in-reference",
        "providerId": "OpenAI",
        "modelId": "gpt-6.2-astra",
        "routeTarget": {
          "state": "unknown"
        },
        "controls": {
          "reasoningEffort": {
            "state": "known",
            "value": "max",
            "source": "override"
          }
        }
      },
      "protocols": {
        "generalId": "general-task-five-original-v1-deep-r2",
        "writingId": "work-writing-12-v1",
        "resourceVersion": "task-five-original-v1-deep-r2"
      },
      "generalDefinition": {
        "schema": "task-five-original-v1",
        "tier": "deep",
        "label": "深入 · 348题（评分修订2）",
        "domains": [
          {
            "id": "knowledge",
            "weight": 0.2,
            "itemIds": [
              "knowledge/mmlu-pro/2815",
              "knowledge/model-eval-original-v1/010",
              "knowledge/mmlu-pro/3820",
              "knowledge/model-eval-original-v1/001",
              "knowledge/model-eval-original-v1/006",
              "knowledge/model-eval-original-v1/002",
              "knowledge/mmlu-pro/6796",
              "knowledge/mmlu-pro/4686",
              "knowledge/mmlu-pro/1831",
              "knowledge/mmlu-pro/9014",
              "knowledge/mmlu-pro/5987",
              "knowledge/mmlu-pro/11254",
              "knowledge/mmlu-pro/9052",
              "knowledge/mmlu-pro/2409",
              "knowledge/model-eval-original-v1/003",
              "knowledge/model-eval-original-v1/004",
              "knowledge/model-eval-original-v1/020",
              "knowledge/model-eval-original-v1/009",
              "knowledge/model-eval-original-v1/022",
              "knowledge/model-eval-original-v1/011",
              "knowledge/mmlu-pro/6530",
              "knowledge/mmlu-pro/4846",
              "knowledge/mmlu-pro/933",
              "knowledge/mmlu-pro/8445",
              "knowledge/mmlu-pro/5475",
              "knowledge/mmlu-pro/10791",
              "knowledge/mmlu-pro/9725",
              "knowledge/mmlu-pro/2639",
              "knowledge/mmlu-pro/3057",
              "knowledge/model-eval-original-v1/005",
              "knowledge/mmlu-pro/4096",
              "knowledge/mmlu-pro/10608",
              "knowledge/model-eval-original-v1/025",
              "knowledge/model-eval-original-v1/012",
              "knowledge/mmlu-pro/6638",
              "knowledge/mmlu-pro/4885",
              "knowledge/mmlu-pro/1154",
              "knowledge/mmlu-pro/7899",
              "knowledge/mmlu-pro/5407",
              "knowledge/mmlu-pro/10931",
              "knowledge/mmlu-pro/9884",
              "knowledge/mmlu-pro/2577",
              "knowledge/mmlu-pro/3437",
              "knowledge/model-eval-original-v1/026",
              "knowledge/model-eval-original-v1/019",
              "knowledge/model-eval-original-v1/008",
              "knowledge/model-eval-original-v1/023",
              "knowledge/model-eval-original-v1/015",
              "knowledge/mmlu-pro/6325",
              "knowledge/mmlu-pro/4835",
              "knowledge/mmlu-pro/1179",
              "knowledge/mmlu-pro/8580",
              "knowledge/mmlu-pro/5216",
              "knowledge/mmlu-pro/10839",
              "knowledge/model-eval-original-v1/027",
              "knowledge/mmlu-pro/2002",
              "knowledge/model-eval-original-v1/018",
              "knowledge/model-eval-original-v1/016",
              "knowledge/mmlu-pro/4432",
              "knowledge/mmlu-pro/10626",
              "knowledge/model-eval-original-v1/024",
              "knowledge/model-eval-original-v1/014",
              "knowledge/mmlu-pro/6237",
              "knowledge/mmlu-pro/4889",
              "knowledge/mmlu-pro/1513",
              "knowledge/mmlu-pro/8556",
              "knowledge/mmlu-pro/5485",
              "knowledge/mmlu-pro/11240",
              "knowledge/model-eval-original-v1/028",
              "knowledge/mmlu-pro/2654",
              "knowledge/model-eval-original-v1/017",
              "knowledge/model-eval-original-v1/021",
              "knowledge/mmlu-pro/4357",
              "knowledge/model-eval-original-v1/007",
              "knowledge/mmlu-pro/7681",
              "knowledge/model-eval-original-v1/013",
              "knowledge/mmlu-pro/6102",
              "knowledge/mmlu-pro/4706",
              "knowledge/mmlu-pro/1798",
              "knowledge/mmlu-pro/8058",
              "math/olympiad-text-math/2839",
              "math/olympiad-text-math/2676",
              "math/olympiad-text-math/2954",
              "math/olympiad-text-math/2522",
              "math/olympiad-text-math/2430",
              "math/olympiad-text-math/2714",
              "math/olympiad-text-math/2851",
              "math/olympiad-text-math/2818",
              "math/olympiad-text-math/2006",
              "math/olympiad-text-math/2894",
              "math/olympiad-text-math/3034",
              "math/olympiad-text-math/2989",
              "math/olympiad-text-math/2494",
              "math/olympiad-text-math/3087",
              "math/olympiad-text-math/2777",
              "math/olympiad-text-math/3079",
              "math/olympiad-text-math/2407",
              "math/olympiad-text-math/3037",
              "math/olympiad-text-math/2859"
            ]
          },
          {
            "id": "reading",
            "weight": 0.2,
            "itemIds": [
              "reading/66eae4de5a08c7b9b35dd12d",
              "reading/66ebb0e55a08c7b9b35ddd6a",
              "reading/66ebbe4f5a08c7b9b35de533",
              "reading/66ebc7445a08c7b9b35df155",
              "reading/66ebca1e5a08c7b9b35df5e8",
              "reading/66ebce825a08c7b9b35dfc75",
              "reading/66ebd3075a08c7b9b35e02bd",
              "reading/66ebd49a5a08c7b9b35e0550",
              "reading/66ebd5125a08c7b9b35e0616",
              "reading/66ebd92d5a08c7b9b35e0bf0",
              "reading/66ebda775a08c7b9b35e0dcb",
              "reading/66ebde0f5a08c7b9b35e1256",
              "reading/66ebe68d5a08c7b9b35e190b",
              "reading/66ebed525a08c7b9b35e1cb4",
              "reading/66ec09ec821e116aacb19620",
              "reading/66ec0d4b821e116aacb19af8",
              "reading/66ec21e6821e116aacb1b2d2",
              "reading/66ec25a5821e116aacb1b5d1",
              "reading/66ec2e2a821e116aacb1bb9f",
              "reading/66ec356a821e116aacb1c22b",
              "reading/66ec3d1d821e116aacb1c622",
              "reading/66ed1556821e116aacb1ea14",
              "reading/66ed910a821e116aacb2033b",
              "reading/66f10d67821e116aacb268d0",
              "reading/66f2b676821e116aacb2b27a",
              "reading/66f2e0bc821e116aacb2bf37",
              "reading/66f37635821e116aacb2d017",
              "reading/66f37eb9821e116aacb2d295",
              "reading/66f3918f821e116aacb2d8b7",
              "reading/66f39aa7821e116aacb2da76",
              "reading/66f41348821e116aacb30c89",
              "reading/66f53b9b821e116aacb332fc",
              "reading/66f55d66821e116aacb33734",
              "reading/66f58d6c821e116aacb33e76",
              "reading/66f618f1bb02136c067c16f9",
              "reading/66f6bcf3bb02136c067c2703",
              "reading/66f78ecfbb02136c067c2f12",
              "reading/66f8c6b4bb02136c067c4480",
              "reading/66f96115bb02136c067c541c",
              "reading/66fa7f1dbb02136c067c6e6b",
              "reading/66fab4bfbb02136c067c754c",
              "reading/66fb5f73bb02136c067c7ae7",
              "reading/6703fc69bb02136c067cd7c2",
              "reading/67040276bb02136c067cd8ae",
              "reading/6709d44abb02136c067d1d5d",
              "reading/6713066fbb02136c067d3214",
              "reading/671b08c8bb02136c067d4e19",
              "reading/671b1335bb02136c067d4e88",
              "reading/671b13f5bb02136c067d4ee3",
              "reading/671b1480bb02136c067d4f14"
            ]
          },
          {
            "id": "instructions",
            "weight": 0.2,
            "itemIds": [
              "instructions/ifeval/3414",
              "instructions/ifeval/3188",
              "instructions/ifeval/1040",
              "instructions/ifeval/3035",
              "instructions/ifeval/3069",
              "instructions/ifeval/1219",
              "instructions/ifeval/2216",
              "instructions/ifeval/2853",
              "instructions/ifeval/279",
              "instructions/ifeval/3098",
              "instructions/ifeval/3380",
              "instructions/ifeval/1571",
              "instructions/ifeval/2943",
              "instructions/ifeval/2275",
              "instructions/ifeval/152",
              "instructions/ifeval/3534",
              "instructions/ifeval/2571",
              "instructions/ifeval/1670",
              "instructions/ifeval/3204",
              "instructions/ifeval/2736",
              "instructions/ifeval/1012",
              "instructions/ifeval/2683",
              "instructions/ifeval/1627",
              "instructions/ifeval/1129",
              "instructions/ifeval/1005",
              "instructions/ifeval/2464",
              "instructions/ifeval/1582",
              "instructions/ifeval/332",
              "instructions/ifeval/3633",
              "instructions/ifeval/1619",
              "instructions/ifeval/1305",
              "instructions/ifeval/3710",
              "instructions/ifeval/1908",
              "instructions/ifeval/2471",
              "instructions/ifeval/2246",
              "instructions/ifeval/1825",
              "instructions/ifeval/3744",
              "instructions/ifeval/143",
              "instructions/ifeval/2439",
              "instructions/ifeval/1512",
              "instructions/ifeval/1705",
              "instructions/ifeval/1481",
              "instructions/ifeval/2616",
              "instructions/ifeval/1379",
              "instructions/ifeval/3311",
              "instructions/ifeval/1342",
              "instructions/ifeval/1348",
              "instructions/ifeval/3502",
              "instructions/ifeval/3243",
              "instructions/ifeval/1392",
              "instructions/ifeval/1000",
              "instructions/ifeval/2035",
              "instructions/ifeval/1897",
              "instructions/ifeval/3724",
              "instructions/ifeval/1325",
              "instructions/ifeval/127",
              "instructions/ifeval/3327",
              "instructions/ifeval/3415",
              "instructions/ifeval/142",
              "instructions/ifeval/3195",
              "instructions/ifeval/3565",
              "instructions/ifeval/1069",
              "instructions/ifeval/3114",
              "instructions/ifeval/2583",
              "instructions/ifeval/3709",
              "instructions/ifeval/3063",
              "instructions/ifeval/1739",
              "instructions/ifeval/2724",
              "instructions/ifeval/2069",
              "instructions/ifeval/1418",
              "instructions/ifeval/3672",
              "instructions/ifeval/1643",
              "instructions/ifeval/2751",
              "instructions/ifeval/30",
              "instructions/ifeval/3084",
              "instructions/ifeval/1314",
              "instructions/ifeval/2765",
              "instructions/ifeval/2372",
              "instructions/ifeval/1122",
              "instructions/ifeval/2416",
              "instructions/ifeval/1813",
              "instructions/ifeval/3276",
              "instructions/ifeval/331",
              "instructions/ifeval/1843",
              "instructions/ifeval/3324",
              "instructions/ifeval/3272",
              "instructions/ifeval/1546",
              "instructions/ifeval/1393",
              "instructions/ifeval/3335",
              "instructions/ifeval/3287",
              "instructions/ifeval/1107",
              "instructions/ifeval/2785",
              "instructions/ifeval/2284",
              "instructions/ifeval/2549",
              "instructions/ifeval/3494",
              "instructions/ifeval/2162",
              "instructions/ifeval/3350",
              "instructions/ifeval/1137",
              "instructions/ifeval/3345",
              "instructions/ifeval/1174"
            ]
          },
          {
            "id": "coding",
            "weight": 0.2,
            "itemIds": [
              "coding/model-eval-original-v1/004",
              "coding/model-eval-original-v1/003",
              "coding/model-eval-original-v1/051",
              "coding/model-eval-original-v1/016",
              "coding/model-eval-original-v1/048",
              "coding/model-eval-original-v1/039",
              "coding/model-eval-original-v1/008",
              "coding/model-eval-original-v1/002",
              "coding/model-eval-original-v1/005",
              "coding/model-eval-original-v1/044",
              "coding/model-eval-original-v1/035",
              "coding/model-eval-original-v1/060",
              "coding/model-eval-original-v1/012",
              "coding/model-eval-original-v1/006",
              "coding/model-eval-original-v1/067",
              "coding/model-eval-original-v1/028",
              "coding/model-eval-original-v1/068",
              "coding/model-eval-original-v1/052",
              "coding/model-eval-original-v1/041",
              "coding/model-eval-original-v1/050",
              "coding/model-eval-original-v1/066",
              "coding/model-eval-original-v1/056",
              "coding/model-eval-original-v1/046",
              "coding/model-eval-original-v1/019",
              "coding/model-eval-original-v1/001",
              "coding/model-eval-original-v1/030",
              "coding/model-eval-original-v1/013",
              "coding/model-eval-original-v1/024",
              "coding/model-eval-original-v1/018",
              "coding/model-eval-original-v1/022",
              "coding/model-eval-original-v1/057",
              "coding/model-eval-original-v1/062",
              "coding/model-eval-original-v1/017",
              "coding/model-eval-original-v1/032",
              "coding/model-eval-original-v1/070",
              "coding/model-eval-original-v1/043",
              "coding/model-eval-original-v1/021",
              "coding/model-eval-original-v1/023",
              "coding/model-eval-original-v1/053",
              "coding/model-eval-original-v1/058",
              "coding/model-eval-original-v1/059",
              "coding/model-eval-original-v1/033",
              "coding/model-eval-original-v1/064",
              "coding/model-eval-original-v1/054",
              "coding/model-eval-original-v1/010",
              "coding/model-eval-original-v1/014",
              "coding/model-eval-original-v1/011",
              "coding/model-eval-original-v1/038",
              "coding/model-eval-original-v1/009",
              "coding/model-eval-original-v1/015",
              "coding/model-eval-original-v1/007",
              "coding/model-eval-original-v1/034",
              "coding/model-eval-original-v1/036",
              "coding/model-eval-original-v1/069",
              "coding/model-eval-original-v1/061",
              "coding/model-eval-original-v1/020",
              "coding/model-eval-original-v1/045",
              "coding/model-eval-original-v1/026",
              "coding/model-eval-original-v1/065",
              "coding/model-eval-original-v1/025",
              "coding/model-eval-original-v1/027",
              "coding/model-eval-original-v1/049",
              "coding/model-eval-original-v1/063",
              "coding/model-eval-original-v1/055",
              "coding/model-eval-original-v1/042",
              "coding/model-eval-original-v1/047",
              "coding/model-eval-original-v1/029",
              "coding/model-eval-original-v1/037",
              "coding/model-eval-original-v1/031",
              "coding/model-eval-original-v1/040"
            ]
          },
          {
            "id": "tools",
            "weight": 0.2,
            "itemIds": [
              "tools/multi_turn_base_39",
              "tools/multi_turn_base_5",
              "tools/multi_turn_base_37",
              "tools/multi_turn_base_27",
              "tools/multi_turn_base_6",
              "tools/multi_turn_base_7",
              "tools/multi_turn_base_17",
              "tools/multi_turn_base_83",
              "tools/multi_turn_base_52",
              "tools/multi_turn_base_66",
              "tools/multi_turn_base_90",
              "tools/multi_turn_base_77",
              "tools/multi_turn_base_69",
              "tools/multi_turn_base_95",
              "tools/multi_turn_base_50",
              "tools/multi_turn_base_148",
              "tools/multi_turn_base_142",
              "tools/multi_turn_base_110",
              "tools/multi_turn_base_130",
              "tools/multi_turn_base_117",
              "tools/multi_turn_base_143",
              "tools/multi_turn_base_129",
              "tools/multi_turn_base_153",
              "tools/multi_turn_base_196",
              "tools/multi_turn_base_152",
              "tools/multi_turn_base_156",
              "tools/multi_turn_base_194",
              "tools/multi_turn_base_151",
              "tools/multi_turn_base_150"
            ]
          }
        ],
        "parentGeneralId": "general-task-five-original-v1-light",
        "executionPolicy": "long-tasks-first-v1",
        "definitionHash": "a080b7c97984cede3829d6d0df8bc8b6290113183c258b45b61fde9218b28efd"
      },
      "details": "cleared",
      "resumeAllowed": false,
      "tracks": {
        "general": {
          "status": "completed",
          "required": 348,
          "graded": 348,
          "measures": {
            "knowledge": {
              "required": 99,
              "graded": 99,
              "passed": 96,
              "score": 96.96969696969697
            },
            "reading": {
              "required": 50,
              "graded": 50,
              "passed": 42,
              "score": 84
            },
            "instructions": {
              "required": 100,
              "graded": 100,
              "passed": 93,
              "score": 93
            },
            "coding": {
              "required": 70,
              "graded": 70,
              "passed": 70,
              "score": 100
            },
            "tools": {
              "required": 29,
              "graded": 29,
              "passed": 21,
              "score": 72.41379310344827
            }
          },
          "score": 89.27669801462905,
          "answered": 348,
          "completedAt": "2026-11-18T09:57:06.681Z"
        }
      },
      "judges": [],
      "metrics": {
        "tracks": {
          "general": {
            "answer": {
              "calls": 633,
              "failures": 10,
              "usageCoverage": 0.9842022116903634,
              "taskTiming": {
                "schema": "task-duration-v1",
                "required": 348,
                "measured": 348,
                "complete": true,
                "domains": [
                  {
                    "id": "knowledge",
                    "weight": 0.2,
                    "required": 99,
                    "measured": 99,
                    "meanMs": 27765.076595959585
                  },
                  {
                    "id": "reading",
                    "weight": 0.2,
                    "required": 50,
                    "measured": 50,
                    "meanMs": 27232.933303999995
                  },
                  {
                    "id": "instructions",
                    "weight": 0.2,
                    "required": 100,
                    "measured": 100,
                    "meanMs": 89533.70454600007
                  },
                  {
                    "id": "coding",
                    "weight": 0.2,
                    "required": 70,
                    "measured": 70,
                    "meanMs": 166225.15771285712
                  },
                  {
                    "id": "tools",
                    "weight": 0.2,
                    "required": 29,
                    "measured": 29,
                    "meanMs": 185138.50712413783
                  }
                ],
                "meanMs": 99179.07585659092
              }
            },
            "judge": {
              "calls": 0,
              "failures": 0,
              "usageCoverage": 0
            },
            "gradingMs": 0
          }
        },
        "activeIntervals": [],
        "incompleteTiming": true
      },
      "createdAt": "2026-11-18T07:09:52.523Z",
      "completedAt": "2026-11-18T09:57:06.681Z"
    },
    "execution": {
      "state": "known",
      "concurrency": 4,
      "callTimeoutMs": 300000,
      "failurePolicy": "output-idle-v1"
    },
    "nativeRun": {
      "schema": "native-run-reference-v1",
      "summarySha256": "a07d2b5376a241e963233916a0029ed22b04e49f8b85da7339217d68d8707868",
      "itemsSha256": "ccebc2bf26c185eee86c3dcac6cf4d8f7a3adb18cc5f8211f8a92052636fa5ed",
      "requiredSha256": "93ea0f7e6168bcb5bd2a85693b700c4f967b2c142bd4b070113b2c354adbcf2e"
    },
    "channel": "ChatGPT 订阅",
    "batchActiveMs": 8912184
  },
  {
    "summary": {
      "runId": "openai-gpt-6.2-astra-max-writing-v1-1",
      "batchId": "built-in-reference",
      "revision": 1,
      "target": {
        "scopeId": "built-in-reference",
        "providerId": "OpenAI",
        "modelId": "gpt-6.2-astra",
        "routeTarget": {
          "state": "unknown"
        },
        "controls": {
          "reasoningEffort": {
            "state": "known",
            "value": "max",
            "source": "override"
          }
        }
      },
      "protocols": {
        "generalId": "general-task-five-original-v1-light",
        "writingId": "work-writing-12-v3",
        "resourceVersion": "task-five-original-v1"
      },
      "details": "cleared",
      "resumeAllowed": false,
      "tracks": {
        "writing": {
          "status": "completed",
          "required": 12,
          "answered": 12,
          "graded": 12,
          "measures": {
            "faithfulness": {
              "required": 12,
              "graded": 12,
              "score": 4
            },
            "logic": {
              "required": 12,
              "graded": 12,
              "score": 4
            },
            "coverage": {
              "required": 12,
              "graded": 12,
              "score": 4
            },
            "concision": {
              "required": 12,
              "graded": 12,
              "score": 3.9166666666666665
            },
            "naturalness": {
              "required": 12,
              "graded": 12,
              "score": 4
            }
          },
          "score": 99.58333333333333,
          "completedAt": "2026-11-18T08:47:18.210Z"
        }
      },
      "judges": [
        {
          "snapshot": {
            "target": {
              "scopeId": "built-in-reference",
              "providerId": "OpenAI",
              "modelId": "gpt-6.2-astra",
              "routeTarget": {
                "state": "unknown"
              },
              "controls": {
                "reasoningEffort": {
                  "state": "known",
                  "value": "max",
                  "source": "override"
                }
              }
            },
            "rubricId": "work-writing-five-dimensions-v1",
            "promptId": "writing-judge-json-v1"
          },
          "itemIds": [
            "writing/ziya:3",
            "writing/ziya:4",
            "writing/ziya:5",
            "writing/dsh-original:community-fund-report-01",
            "writing/ziya:31",
            "writing/ziya:40",
            "writing/ziya:50",
            "writing/ziya:94",
            "writing/ziya:115",
            "writing/ziya:129",
            "writing/dsh-original:news-materials-01",
            "writing/dsh-original:meeting-actions-01"
          ]
        }
      ],
      "metrics": {
        "tracks": {
          "writing": {
            "answer": {
              "calls": 16,
              "failures": 4,
              "usageCoverage": 0.75,
              "taskTiming": {
                "schema": "task-duration-v1",
                "required": 12,
                "measured": 12,
                "complete": true,
                "meanMs": 95543.02819166666
              }
            },
            "judge": {
              "calls": 13,
              "failures": 1,
              "usageCoverage": 0.9230769230769231
            },
            "gradingMs": 0
          }
        },
        "activeIntervals": [],
        "incompleteTiming": true
      },
      "createdAt": "2026-11-18T07:02:56.391Z",
      "completedAt": "2026-11-18T08:47:18.210Z"
    },
    "execution": {
      "state": "known",
      "concurrency": 4,
      "callTimeoutMs": 300000,
      "failurePolicy": "output-idle-v1"
    },
    "channel": "ChatGPT 订阅",
    "nativeRun": {
      "schema": "native-run-reference-v1",
      "summarySha256": "8f137af14f2b2ca46277804954a67223eaf9caa335b9903fb04a5efb51c03bd1",
      "itemsSha256": "6b1673aae46977f3a8c21864e0767544bdd147553d60e4ca18f4d4cb6ab117eb",
      "requiredSha256": "b9c31d7a22d64da25d1a157cd7d4ebe175fe232e3f2b7e8c592336a8e28fdb54"
    }
  },
  {
    "summary": {
      "runId": "openai-gpt-6-astra-max-writing-v1-0",
      "batchId": "built-in-reference",
      "revision": 1,
      "target": {
        "scopeId": "built-in-reference",
        "providerId": "OpenAI",
        "modelId": "gpt-6-astra",
        "routeTarget": {
          "state": "unknown"
        },
        "controls": {
          "reasoningEffort": {
            "state": "known",
            "value": "max",
            "source": "override"
          }
        }
      },
      "protocols": {
        "generalId": "general-task-five-v3-r3-light",
        "writingId": "work-writing-12-v2",
        "resourceVersion": "task-five-v3-r3"
      },
      "details": "cleared",
      "resumeAllowed": false,
      "tracks": {
        "writing": {
          "status": "completed",
          "required": 12,
          "answered": 12,
          "graded": 12,
          "measures": {
            "faithfulness": {
              "required": 12,
              "graded": 12,
              "score": 4
            },
            "logic": {
              "required": 12,
              "graded": 12,
              "score": 4
            },
            "coverage": {
              "required": 12,
              "graded": 12,
              "score": 4
            },
            "concision": {
              "required": 12,
              "graded": 12,
              "score": 3.75
            },
            "naturalness": {
              "required": 12,
              "graded": 12,
              "score": 3.9166666666666665
            }
          },
          "score": 98.33333333333333,
          "completedAt": "2026-11-12T17:37:32.022Z"
        }
      },
      "judges": [
        {
          "snapshot": {
            "target": {
              "scopeId": "built-in-reference",
              "providerId": "OpenAI",
              "modelId": "gpt-6-astra",
              "routeTarget": {
                "state": "unknown"
              },
              "controls": {
                "reasoningEffort": {
                  "state": "known",
                  "value": "max",
                  "source": "override"
                }
              }
            },
            "rubricId": "work-writing-five-dimensions-v1",
            "promptId": "writing-judge-json-v1"
          },
          "itemIds": [
            "writing/ziya:3",
            "writing/ziya:4",
            "writing/ziya:5",
            "writing/ziya:13",
            "writing/ziya:31",
            "writing/ziya:40",
            "writing/ziya:50",
            "writing/ziya:94",
            "writing/ziya:115",
            "writing/ziya:129",
            "writing/dsh-original:news-materials-01",
            "writing/dsh-original:meeting-actions-01"
          ]
        }
      ],
      "metrics": {
        "tracks": {
          "writing": {
            "answer": {
              "calls": 12,
              "failures": 0,
              "usageCoverage": 1,
              "inputTokens": 2839,
              "outputTokens": 45117,
              "totalTokens": 47956,
              "reasoningTokens": 26611,
              "cacheReadTokens": 0,
              "taskTiming": {
                "schema": "task-duration-v1",
                "required": 12,
                "measured": 12,
                "complete": true,
                "meanMs": 133681.796075
              }
            },
            "judge": {
              "calls": 12,
              "failures": 0,
              "usageCoverage": 1,
              "inputTokens": 32019,
              "outputTokens": 34124,
              "totalTokens": 66143,
              "reasoningTokens": 24545,
              "cacheReadTokens": 0
            },
            "gradingMs": 0
          }
        },
        "activeIntervals": [],
        "incompleteTiming": true
      },
      "createdAt": "2026-11-12T17:24:31.873Z",
      "completedAt": "2026-11-12T17:37:32.022Z"
    },
    "execution": {
      "state": "known",
      "concurrency": 4,
      "callTimeoutMs": 300000,
      "failurePolicy": "output-idle-v1"
    },
    "channel": "ChatGPT 订阅",
    "nativeRun": {
      "schema": "native-run-reference-v1",
      "summarySha256": "d0d7c7f624c16edbc19954740662b93bff6c8820860dd343ef625ca6eed378ea",
      "itemsSha256": "ad18500740ebb93cc56656513a7abc2e18a9520b297dbf9b593ba1484152a7f1",
      "requiredSha256": "ccc41d29109d7a87503c78322de648ba997aab254564147f8dd733fc696f177a"
    }
  }
];
