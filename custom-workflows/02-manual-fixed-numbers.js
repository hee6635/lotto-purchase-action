import fs from 'fs';

export default async function(api) {
    const page = api.page || (api.session ? api.session.page : null);
    if (!page) return { status: "fail", message: "조종기 연결 실패" };

    try {
        console.log("=== 🕵️‍♂️ [사용자 제안] 로그인 쿠키 정밀 감식 작전 ===");

        // 1. 💡 [사용자 제안 코드] 현재 브라우저 컨텍스트의 모든 쿠키 확보
        const cookies = await page.context().cookies();
        
        console.log("==========================================");
        console.log(`🍪 현재 브라우저가 보유 중인 쿠키 총 ${cookies.length}개`);
        
        // 2. 쿠키 목록 분석 출력
        let hasGlobalCookie = false;
        cookies.forEach(c => {
            // value가 너무 길면 보기 힘드니 앞 15자리만 자릅니다
            const shortValue = c.value.length > 15 ? c.value.substring(0, 15) + "..." : c.value;
            console.log(` └ [${c.domain}] ${c.name} = ${shortValue}`);

            // 도메인이 '.dhlottery.co.kr'로 시작하면 전역 쿠키!
            if (c.domain === '.dhlottery.co.kr' && (c.name.includes('JSESSIONID') || c.name.includes('SSO'))) {
                hasGlobalCookie = true;
            }
        });
        console.log("==========================================");

        // 3. 진단 결과 브리핑
        if (hasGlobalCookie) {
            console.log("✅ [진단] '.dhlottery.co.kr' 전역 쿠키가 있습니다. (연금복권 창에서도 세션이 유지되어야 정상!)");
        } else {
            console.log("⚠️ [진단] 전역 쿠키가 안 보입니다. 특정 도메인(예: m.dhlottery.co.kr)에만 로그인된 상태(반쪽짜리 로그인)일 확률이 높습니다.");
        }

    } catch (e) {
        console.log(`❌ 디버그 중 에러: ${e.message}`);
    }

    return { status: "success", balance: "0" };
}
