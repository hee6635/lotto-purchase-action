import fs from 'fs';

export default async function(api) {
    const page = api.page || (api.session ? api.session.page : null);
    if (!page) return { status: "fail", message: "조종기 연결 실패" };

    let currentBalance = "0";

    try {
        console.log("=== 👻 [스텔스 작전] Headless 탐지 우회 및 전수 조사 ===");

        // 1. 💡 [핵심] 로봇임을 증명하는 'webdriver' 속성 지우기 (탐지 우회)
        await page.addInitScript(() => {
            Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
        });

        // 2. PC 로그인 세션과 일치시키기 위해 화면 크기 고정 (1920x1080)
        await page.setViewportSize({ width: 1920, height: 1080 });

        // 3. 📡 PC 메인 페이지로 정석 접속 (가장 차단이 덜한 경로)
        console.log("📡 신분 위장 완료. PC 메인 페이지 접속 중...");
        await page.goto("https://dhlottery.co.kr/common.do?method=main", { 
            waitUntil: "networkidle", 
            timeout: 60000 // 타르핏 방어를 위해 60초로 대폭 연장
        });

        // 4. 사람처럼 보이기 위해 무작위 마우스 움직임/스크롤 흉내
        await page.mouse.move(Math.random() * 500, Math.random() * 500);
        await page.waitForTimeout(4000); // 4초간 멍 때리기 (로봇은 멍 때리지 않음)

        // 5. 🔍 [정밀 추적] 화면에 '로그아웃' 버튼이 있는지로 로그인 성공 여부 먼저 확인
        const loginStatus = await page.evaluate(() => {
            const isLoggedOutVisible = document.body.innerText.includes("로그아웃");
            const userNames = document.body.innerText.match(/([가-힣]{2,4})님/);
            return { isLoggedOutVisible, userName: userNames ? userNames[0] : "미확인" };
        });

        console.log(`📍 로그인 상태 체크: ${loginStatus.isLoggedOutVisible ? '✅ 로그인 유지 중' : '❌ 세션 끊김'}`);
        console.log(`👤 사용자 인식: ${loginStatus.userName}`);

        // 6. 💰 잔액 추출 (0원 껍데기가 숫자로 채워질 때까지 대기)
        if (loginStatus.isLoggedOutVisible) {
            console.log("⏳ 잔액 데이터 수신 대기 (최대 10초)...");
            currentBalance = await page.evaluate(async () => {
                const delay = ms => new Promise(res => setTimeout(res, ms));
                for (let i = 0; i < 10; i++) {
                    const moneyTag = document.querySelector('.money strong') || document.querySelector('.my_money');
                    const val = moneyTag ? moneyTag.innerText.replace(/[^0-9]/g, '') : "0";
                    if (val !== "0" && val !== "") return val;
                    await delay(1000);
                }
                return "0";
            });
        }

        console.log(`✅ 최종 포착 잔액: ${currentBalance}원`);

    } catch (e) {
        console.log(`❌ 스텔스 작전 중 에러: ${e.message}`);
    }

    // 🚀 [실전 구매] 6시가 넘었으니 구매는 시도합니다.
    try {
        const inputEnv = process.env.INPUT_LOTTO_NUMBERS;
        const targetNumbers = inputEnv ? inputEnv.split(',').map(Number) : [10, 16, 21, 37, 42, 45];
        if (api.purchaseManual && currentBalance !== "0") {
            await api.purchaseManual([targetNumbers]);
            console.log("✅ 구매 시도 완료");
        }
    } catch (err) {}

    // 결과 저장
    const resultData = { balance: currentBalance, last_run: new Date().toISOString() };
    fs.writeFileSync('result.json', JSON.stringify(resultData, null, 2));

    return { status: "success", balance: currentBalance };
}
