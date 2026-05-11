import fs from 'fs';

export default async function(api) {
    const page = api.page || (api.session ? api.session.page : null);
    if (!page) return { status: "fail", message: "조종기 연결 실패" };

    let currentBalance = "0";
    let finalStatus = "success";
    let finalMessage = "작업 완료";

    try {
        console.log("=== 🎯 잔액 조회 및 복합 로또 구매 ===");
        await page.addInitScript(() => {
            Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
        });

        // 1. 예치금 조회
        const response = await page.goto(
            'https://www.dhlottery.co.kr/mypage/selectUserMndp.do',
            { waitUntil: 'networkidle', timeout: 30000 }
        );
        const json = JSON.parse(await response.text());
        if (json?.data?.userMndp?.crntEntrsAmt !== undefined) {
            currentBalance = String(json.data.userMndp.crntEntrsAmt);
        } else {
            throw new Error("JSON 구조 오류");
        }
    } catch (e) {
        finalStatus = "fail";
        finalMessage = "잔액 조회 실패";
    }

    // 2. 🚀 [핵심] 여러 게임 다중 구매 로직
    if (finalStatus === "success" && currentBalance !== "0" && parseInt(currentBalance) >= 1000) {
        try {
            const inputEnv = process.env.INPUT_LOTTO_NUMBERS;
            
            // 💡 어플에서 보낸 "1,2,3,4,5,6 | 10,11,12,13,14,15" 데이터를 배열로 쪼갭니다.
            let targetNumbersArray = [];
            if (inputEnv && inputEnv.includes('|')) {
                targetNumbersArray = inputEnv.split('|').map(group => group.split(',').map(Number));
            } else if (inputEnv) {
                targetNumbersArray = [inputEnv.split(',').map(Number)];
            } else {
                targetNumbersArray = [[10, 16, 21, 37, 42, 45]]; // 기본값
            }

            console.log(`🚀 총 ${targetNumbersArray.length}게임 구매 프로세스를 시도합니다...`);
            
            if (api.purchaseManual) {
                // api.purchaseManual은 배열 안의 배열을 처리할 수 있습니다.
                await api.purchaseManual(targetNumbersArray);
                finalMessage = `총 ${targetNumbersArray.length}게임 구매 성공!`;
            }
        } catch (err) {
            console.log(`⚠️ 구매 에러 발생: ${err.message}`);
            // (이전 코드의 현장 검시관 로직은 길이상 생략했지만, 그대로 유지하시면 됩니다)
            finalStatus = "fail";
            finalMessage = "구매 중 에러 발생 (한도 초과 등)";
        }
    }

    fs.writeFileSync('result.json', JSON.stringify({ 
        status: finalStatus, message: finalMessage, balance: currentBalance, last_run: new Date().toISOString() 
    }));

    return { status: finalStatus, balance: currentBalance };
}
