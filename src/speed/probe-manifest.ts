/** Fixed public task selection; generated offline, never a scoring protocol. */
export const PROBE_MANIFEST={
  "id": "speed-probe-v1",
  "generalId": "general-chat-root-stable-rule-tokenizer-v3",
  "writingId": "work-writing-12-v1",
  "resourceVersion": "suite-2026-10-31-v3",
  "items": [
    {
      "id": "tiny-mmlu/tiny-mmlu:23",
      "datasetId": "tiny-mmlu",
      "sourceHash": "8648d419cd08739830f9a8742178eee9d06263a8080e12a503e031b5fa2d210f",
      "promptHash": "f9e46e5ed5e1e9f83244dc2a10b2b84c070e4df55fbb35a93f64e0e73b289e63"
    },
    {
      "id": "writing/ziya:13",
      "datasetId": "writing",
      "sourceHash": "b00305a6971935f8c8ec0fd74d9b7664877df1f2936ada2949da6b3c13eb9242",
      "promptHash": "eedf14c675fec26d75d63f3d4365b8c1affb4054c4669cf160db5d2a504f143c"
    },
    {
      "id": "tiny-gsm8k/tiny-gsm8k:34",
      "datasetId": "tiny-gsm8k",
      "sourceHash": "8b943969ec01175837fcec4a6bdf6adf3f20850bc1ee76b2a92763cf183bdf49",
      "promptHash": "0c9073b5c9054b8499ff5486de86be5e5f98906ba496b33e2704e8abd7dc1d04"
    },
    {
      "id": "ifeval/ifeval:152",
      "datasetId": "ifeval",
      "sourceHash": "aa5cdf044341a276944dd5fdde86c8cfb390d10ed9ff3c36d2a26335a3031c1a",
      "promptHash": "e1cd0a07a49230d7b1313c2646f5c76af33865e91ab9fe33eab87281684feb39"
    },
    {
      "id": "humaneval-plus/HumanEval/62",
      "datasetId": "humaneval-plus",
      "sourceHash": "2ed91ee79d7a7ff2cac9f9699c62f64df5f2e38d86c9bcac80d028bb32933331",
      "promptHash": "997b88e400509665b377933772900ab97dfc0edd678dc42b8ee5113dd094cda5"
    },
    {
      "id": "tiny-mmlu/tiny-mmlu:11",
      "datasetId": "tiny-mmlu",
      "sourceHash": "765070c50dc1e4a309c36004d14b8d16193684ec89dd42e8068dbb61c96fc1c4",
      "promptHash": "1aa04b5a324aa9d4789525efe114a9ec0c22c44e34e15cb412172ce8cec6b6f9"
    },
    {
      "id": "writing/ziya:94",
      "datasetId": "writing",
      "sourceHash": "6d20c7a32f0d3b92e081243d65a6d3a1ba82dd40de76766fa56370d2ab7caa76",
      "promptHash": "5ceacef335f42ade0cde2aea998a79622cb301568a85090fc14c4c24eff91aa2"
    },
    {
      "id": "tiny-gsm8k/tiny-gsm8k:45",
      "datasetId": "tiny-gsm8k",
      "sourceHash": "8fa7f43f669e93a5b4f6a1758abac85be8a3ac0c2f8f13c3d36e35e71daa9aa7",
      "promptHash": "b8a0bc84455ecdf8b08495ab99e5f5ac344f8802279194f3c1001c267a688bf9"
    },
    {
      "id": "ifeval/ifeval:1834",
      "datasetId": "ifeval",
      "sourceHash": "44dfd5c90b5fb8f5a14052ea309cefafb9f298c1f39f4c0c683ba4e3f95b1c40",
      "promptHash": "d472b58736c88c5b3245ca7218b98a27b0d1e9cad23cdc85c777e5ea8cb997e0"
    },
    {
      "id": "humaneval-plus/HumanEval/126",
      "datasetId": "humaneval-plus",
      "sourceHash": "050a2b9defc209aa64d0777939ff3387ee7db918434d818789eab7b36578b7ca",
      "promptHash": "29a8a377ade06868d0d6f0c764f5de17cc7b27c7e87dc691b5c08a0990082089"
    }
  ]
} as const;
export const TIER_PROBE_MANIFESTS=[
  {
    "id": "speed-probe-light-v1",
    "generalId": "general-two-tier-v1-light",
    "writingId": "work-writing-12-v1",
    "resourceVersion": "two-tier-v1",
    "items": [
      {
        "id": "knowledge/mmlu-pro/2577",
        "datasetId": "mmlu-pro-selected",
        "sourceHash": "742eb19da936562ca9a6f661fb223efb794bcc0f0708b7161d34298b33a07851",
        "promptHash": "108834058763c9e97eeb66f6dcf30c408845777c09d0d47a135ad306a0e64f03",
        "questionHash": "a863dd0e91e2a99f0cb0fa33d6d804fe47b69814207529d28732e3c492558eb7",
        "compatibilityHash": "316a0503c317af9d8445fb0721b3dfc1348b58b7694a2fc1e1091a3198038a95"
      },
      {
        "id": "writing/ziya:13",
        "datasetId": "writing",
        "sourceHash": "b00305a6971935f8c8ec0fd74d9b7664877df1f2936ada2949da6b3c13eb9242",
        "promptHash": "eedf14c675fec26d75d63f3d4365b8c1affb4054c4669cf160db5d2a504f143c",
        "questionHash": "948ad1e48083b719970400d1d867e896b893ccd4e54e0217bf69d416ed97eb3e",
        "compatibilityHash": "1bb87ab55e237a26f3df726bfb60ef5db6d0dfce68169930b2e16dee8cd6acaa"
      },
      {
        "id": "math/olympiad-text-math/3040",
        "datasetId": "olympiad-text-selected",
        "sourceHash": "253cf834abc2fc499679aa71aaab258ed99a2742c404afee52c378dab853592c",
        "promptHash": "d1f353260734be0ad1b60aa321584a27d73fa9094979340a7cdf507762d070e2",
        "questionHash": "1964a25979a4170c2e507a76f6c10a0b81f1508f5c68dc3343e832a412b82bce",
        "compatibilityHash": "45453d25fcf4e92a7c9d988fce940ebae047cc09ed86dc2f5f1845bead468680"
      },
      {
        "id": "instructions/ifeval/3069",
        "datasetId": "ifeval",
        "sourceHash": "ee930c7065fb7723f7bd1f9cad35c6a7e4fb11095b782b82e90dd0b1e2b3fbe6",
        "promptHash": "115239955ca8eb9335a4103c2d58ed4f0befd0cbc0907b9e8b71361ccd798900",
        "questionHash": "9504d1b8650f68d3babe5685e451bc3aefad91347280210a147a463fca294cc2",
        "compatibilityHash": "746f11836c8f4f8b32c51c80a7089374ed4fc193ad96df3e7819c07478e6cdd4"
      },
      {
        "id": "coding/code-contests-test/116",
        "datasetId": "code-contests-selected",
        "sourceHash": "f346c76dc0d7c2cbf0014f59fc2db1032d6246d189afbf53c4fbffd763dee83a",
        "promptHash": "61760c6cfb2e5bcacc918256348418f668e11fdc02ee9302eb958f49323c63db",
        "questionHash": "f46fbd4ea6ff7fc7f6e3e72494aae0e40091f96c4eff7dcc1b0357fb54bc5edc",
        "compatibilityHash": "e90fdc68f6a2640b2386ce30c2aa31d7679f2868f34d2d895a821cf0171f41ca"
      },
      {
        "id": "knowledge/mmlu-pro/5475",
        "datasetId": "mmlu-pro-selected",
        "sourceHash": "ceb9fdb76c510cf2fcaba4b0703f336f106c5a8ec977abd817b63ecef79bf6b3",
        "promptHash": "a7da090fd203488deecce1c8cdab1dc3ab3334f7b3f976cb137afef26fe8b900",
        "questionHash": "f6566480cc9f6d1c35ef04c884432dbf3cbf27e4db37290d56a95bcb8bbd3872",
        "compatibilityHash": "7ef9601932ec7e90a1afa92e6ee889812bc06a8dbddb7b05462373b7598ae3b2"
      },
      {
        "id": "writing/ziya:94",
        "datasetId": "writing",
        "sourceHash": "6d20c7a32f0d3b92e081243d65a6d3a1ba82dd40de76766fa56370d2ab7caa76",
        "promptHash": "5ceacef335f42ade0cde2aea998a79622cb301568a85090fc14c4c24eff91aa2",
        "questionHash": "35ca8f7e500b95a7e6d5c99512c92f54d853bbc0aa15a7bf0bb831b74501eb80",
        "compatibilityHash": "b7816a395a5036519a122a7d95fd24b79315ac1e963753aec6a3c3d41e495acd"
      },
      {
        "id": "math/olympiad-text-math/2902",
        "datasetId": "olympiad-text-selected",
        "sourceHash": "3109aac0627aed8d15c8a0d9001ee703915c8d2d6eec6fc5c77a2963a54a3d40",
        "promptHash": "5314cb8fbbacfcff4b4440eaf1b89669bc400061f27e2bbc1c0d58d08f874ef5",
        "questionHash": "d9144c99c1051dcb1695590b4462c915cdb321a6679fd3b861dc7539d30e46a8",
        "compatibilityHash": "7e9a518a7f8b5dcc82c55a188cf78c5090aa3012f183ded998a3a4dc26d5e8d5"
      },
      {
        "id": "instructions/ifeval/2275",
        "datasetId": "ifeval",
        "sourceHash": "a520c309cb9f0f2245b3054c8dea96cfcb2fd703fcb599c393ff9879a668b44e",
        "promptHash": "1d48f315cb27db07d5d8ba75a90ce5dcfa6093f576e0c8256e0f3ea2cd136b7b",
        "questionHash": "001d6bea7dda49d46c372a11970c79933d62a60b606875341f7b471776eeeb82",
        "compatibilityHash": "95ca9cb42c05afcf8a847cad41ccbf7a3aecbbdb6350683867ac4e12366034b7"
      },
      {
        "id": "coding/code-contests-test/82",
        "datasetId": "code-contests-selected",
        "sourceHash": "99a9a3017eadf88edfc242a22bfb6c785f13b89c2a8ed1f045533f1f22c97732",
        "promptHash": "506ce2a78cc69b14e8745845a1de056af2350e2d1ecbb0c5c7cdcc617e5c287d",
        "questionHash": "9267de19e033b6f53c5b181b9d5a6052401d3fcf2ee4407d90effc268f76a029",
        "compatibilityHash": "c2c1bcf1c3fbd315d93a98937a5d78c120ee407970ee911e9f39ea9c28b5242e"
      }
    ]
  },
  {
    "id": "speed-probe-deep-v1",
    "generalId": "general-two-tier-v1-deep",
    "writingId": "work-writing-12-v1",
    "resourceVersion": "two-tier-v1",
    "items": [
      {
        "id": "knowledge/mmlu-pro/11175",
        "datasetId": "mmlu-pro-selected",
        "sourceHash": "5e41bfbcab04264b31cf74fb8f426bcd8f1ff9570be29e15729fe919c9f2da51",
        "promptHash": "975430233a971e044eeaa0db18c4e8642fcc496815c33ffb7847c8f4655e5c0b",
        "questionHash": "28d4baee91f1290550bc75ed63afcf1ca3ff4c9935f1b11ae8cefdbc84765830",
        "compatibilityHash": "1490a689ee44a03c60bced09a39547b0fa78eb7e84081ce601092e181d2aeda4"
      },
      {
        "id": "writing/ziya:13",
        "datasetId": "writing",
        "sourceHash": "b00305a6971935f8c8ec0fd74d9b7664877df1f2936ada2949da6b3c13eb9242",
        "promptHash": "eedf14c675fec26d75d63f3d4365b8c1affb4054c4669cf160db5d2a504f143c",
        "questionHash": "948ad1e48083b719970400d1d867e896b893ccd4e54e0217bf69d416ed97eb3e",
        "compatibilityHash": "1bb87ab55e237a26f3df726bfb60ef5db6d0dfce68169930b2e16dee8cd6acaa"
      },
      {
        "id": "math/olympiad-text-math/2738",
        "datasetId": "olympiad-text-selected",
        "sourceHash": "394d1f7b1f0866491fa2831e86bd3c58026684ed0ae1052cc554b91dfd7cd018",
        "promptHash": "02f281c265be572b6336d648c2f9eb2e250c44a4e68bd651f9f8cf036c768af9",
        "questionHash": "a0ff56adc77b7926409626e1eff7156fbc925def279d9fcbfd6117f6dd7a45ee",
        "compatibilityHash": "26c86411237ecaaf721f808b88ad45bcbf6b50a3160a221063c227545d8bd033"
      },
      {
        "id": "instructions/ifeval/3534",
        "datasetId": "ifeval",
        "sourceHash": "2a5c40676a87db6738a2513b949384a45f81b08b0f3f8346b2c3e02f1d4f4301",
        "promptHash": "c027e433213e7aad97cc86f05c3f47b517a3c432dfd34f4e1fefd17493f65fb6",
        "questionHash": "25fb6328757c62f1d00a982574bce3443f8aab1c0513c00823e251ab924887de",
        "compatibilityHash": "6471c4a2e4e8c6d2eff08b90042f3800fa18954015a27f97860b3958a043961d"
      },
      {
        "id": "coding/code-contests-test/2",
        "datasetId": "code-contests-selected",
        "sourceHash": "9fe2b685156440d62d7b8e89169adcc8e55a27597c2787119d6b68d8ca0b6a58",
        "promptHash": "d1ec0075e8e606c1a25386938af5263b7c13628197698f74d43ce6355df1702e",
        "questionHash": "1f02e69f670870d23314436675f3448ebb2c7d36b2cc97595d5a7640f38f053b",
        "compatibilityHash": "f33ad6cd8ef3ef34e091a1b193f2874fd3ba10dc9993e401e210c2ee1f6388c3"
      },
      {
        "id": "knowledge/mmlu-pro/4819",
        "datasetId": "mmlu-pro-selected",
        "sourceHash": "3ea8b841f9cecc4aa07a30aa09ceed74ac4d781f84159b4c0aa628bfe6e224e9",
        "promptHash": "d18068e982525d31edc9d5282d2a5bdcb8ac0bac9faea2b5dafd890c57517aa1",
        "questionHash": "8d30b30d99c44844beda68096c77a49404dc419e861737dc06a9309dc7757791",
        "compatibilityHash": "167887075f0063bd54abbaab845601f65163c29c6b6b0f263984f5399a696cc1"
      },
      {
        "id": "writing/ziya:94",
        "datasetId": "writing",
        "sourceHash": "6d20c7a32f0d3b92e081243d65a6d3a1ba82dd40de76766fa56370d2ab7caa76",
        "promptHash": "5ceacef335f42ade0cde2aea998a79622cb301568a85090fc14c4c24eff91aa2",
        "questionHash": "35ca8f7e500b95a7e6d5c99512c92f54d853bbc0aa15a7bf0bb831b74501eb80",
        "compatibilityHash": "b7816a395a5036519a122a7d95fd24b79315ac1e963753aec6a3c3d41e495acd"
      },
      {
        "id": "math/olympiad-text-math/1945",
        "datasetId": "olympiad-text-selected",
        "sourceHash": "865978ab7da42e034dc73f7eb1bb0a1587c9d5ca41ecc07f1cba7b68da17bec4",
        "promptHash": "f4f1e47f1750bbd118f2d9638ff240a501e23ff0ed05c9e8991c516f4622e5aa",
        "questionHash": "088fe2d8e6467e38635a279c11b85291ac266722428c9cf024c69abe0328cab9",
        "compatibilityHash": "4832e65038fea4b3c8a1901a9454d7edc068df30675c00eac6f04c8bce88d0df"
      },
      {
        "id": "instructions/ifeval/1512",
        "datasetId": "ifeval",
        "sourceHash": "a7aa63520d2a46ece10223428f19f50f4a668aab3d8e65e0ee4d2616147c9395",
        "promptHash": "3845182951a37897c0302947719f8ea113cdfdeef2c4fb12bc64570888ce5c09",
        "questionHash": "f89c9163242411c7c28c692c389a39c8bd680ce1e8103dd9748833292a2f98d1",
        "compatibilityHash": "0efec684d593e8ce6d94b32957922bf43936753c0f02f4225459c279c9219277"
      },
      {
        "id": "coding/code-contests-test/44",
        "datasetId": "code-contests-selected",
        "sourceHash": "cd01b96baf81faafe6cc9277979ef781a631449f9641331ea470c8d843b8e2fd",
        "promptHash": "06b84f688ff31118e8cfdd88ed4ac4cab49ff646208b99829323c96464882aa3",
        "questionHash": "b7b7363adbb13c6118ab8cf5076998c524e5828acb049d3c63fad0a662e0a9ed",
        "compatibilityHash": "4da6e5683abaf2ea32c18d2c75a079877adb38b9d23ab72bb0b701e8095398a4"
      }
    ]
  }
] as const;
