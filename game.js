// ==========================================
// SURGERY GAME LOGIC (HOST ONLY)
// Stylized, non-gory operating-room simulator
// ==========================================
const Game = (() => {
    let canvas, ctx, width = 0, height = 0, dpr = 1;
    let cursorX = .5, cursorY = .5;
    let selectedTool = 'scalpel';
    let state = 'closed';
    let stitchCount = 0;
    const STITCHES_NEEDED = 3;
    let lives = 3, score = 0, startTime = null, elapsedSeconds = 0;
    let feedbackMsg = '', feedbackTimer = 0, feedbackColor = '#ff5c68';
    let onFeedbackCallback = null;
    let actionPulse = 0, coinLift = 0, successPulse = 0;
    let restartBtnBounds = null;

    const incisionZone = { x:.5, y:.52, w:.14, h:.05 };
    const coinPos = { x:.5, y:.53 };
    const coinRadius = .02;

    function init(canvasEl) {
        canvas = canvasEl;
        ctx = canvas.getContext('2d');
        resize();
        window.addEventListener('resize', resize);
        canvas.addEventListener('click', handleCanvasClick);
        startTime = Date.now();
        requestAnimationFrame(loop);
    }

    function resize() {
        dpr = Math.min(2, window.devicePixelRatio || 1);
        width = window.innerWidth; height = window.innerHeight;
        canvas.width = Math.floor(width * dpr);
        canvas.height = Math.floor(height * dpr);
        canvas.style.width = width + 'px';
        canvas.style.height = height + 'px';
        ctx.setTransform(dpr,0,0,dpr,0,0);
    }

    function setOnFeedback(cb){ onFeedbackCallback = cb; }
    function setCursor(x,y){ cursorX=Math.max(0,Math.min(1,x)); cursorY=Math.max(0,Math.min(1,y)); }
    function setTool(tool){ selectedTool=tool; }
    function withinRect(px,py,z){ return Math.abs(px-z.x)<z.w && Math.abs(py-z.y)<z.h; }
    function withinCircle(px,py,c,r){ return Math.hypot(px-c.x,py-c.y)<r; }

    function flashFeedback(msg,color){
        feedbackMsg=msg; feedbackColor=color; feedbackTimer=90; successPulse=1;
    }
    function sendPhoneFeedback(result,message){ onFeedbackCallback?.(result,message); }

    function loseLife(){
        lives--;
        actionPulse=1;
        if(lives<=0) state='failed';
    }

    function performAction(){
        if(state==='done'||state==='failed') return;
        actionPulse=1;

        if(state==='closed'){
            if(selectedTool!=='scalpel'){
                flashFeedback('WRONG TOOL — SCALPEL REQUIRED','#ff5c68');
                sendPhoneFeedback('fail','Use the scalpel on the incision');
                loseLife(); return;
            }
            if(!withinRect(cursorX,cursorY,incisionZone)){
                flashFeedback('MOVE TO THE INCISION','#ffb454');
                sendPhoneFeedback('fail','Missed — move over the incision');
                loseLife(); return;
            }
            state='open';
            flashFeedback('INCISION COMPLETE — REMOVE THE COIN','#35d0b0');
            sendPhoneFeedback('success','Incision complete! Switch to forceps');
            return;
        }

        if(state==='open'){
            if(selectedTool!=='forceps'){
                flashFeedback('WRONG TOOL — FORCEPS REQUIRED','#ff5c68');
                sendPhoneFeedback('fail','Use forceps to grab the coin');
                loseLife(); return;
            }
            if(!withinCircle(cursorX,cursorY,coinPos,coinRadius*1.8)){
                flashFeedback('AIM AT THE COIN','#ffb454');
                sendPhoneFeedback('fail','Missed the coin — get closer');
                loseLife(); return;
            }
            state='stitching'; score+=100; coinLift=1;
            flashFeedback('COIN REMOVED — CLOSE THE WOUND','#35d0b0');
            sendPhoneFeedback('success','Coin removed! Switch to needle');
            return;
        }

        if(state==='stitching'){
            if(selectedTool!=='needle'){
                flashFeedback('WRONG TOOL — NEEDLE REQUIRED','#ff5c68');
                sendPhoneFeedback('fail','Use the needle to stitch');
                loseLife(); return;
            }
            if(!withinRect(cursorX,cursorY,incisionZone)){
                flashFeedback('AIM AT THE WOUND','#ffb454');
                sendPhoneFeedback('fail','Missed — move over the wound');
                loseLife(); return;
            }
            stitchCount++; score+=50;
            if(stitchCount>=STITCHES_NEEDED){
                state='done';
                elapsedSeconds=Math.floor((Date.now()-startTime)/1000);
                flashFeedback('SURGERY COMPLETE','#35d0b0');
                sendPhoneFeedback('success','Surgery complete! Great work, doctor.');
            }else{
                flashFeedback(`STITCH ${stitchCount}/${STITCHES_NEEDED}`,'#35d0b0');
                sendPhoneFeedback('success',`Stitch ${stitchCount}/${STITCHES_NEEDED}`);
            }
        }
    }

    function restart(){
        state='closed'; stitchCount=0; lives=3; score=0; startTime=Date.now();
        elapsedSeconds=0; feedbackMsg=''; feedbackTimer=0; coinLift=0; successPulse=0;
    }

    function handleCanvasClick(e){
        if((state==='done'||state==='failed')&&restartBtnBounds){
            const r=canvas.getBoundingClientRect();
            const x=e.clientX-r.left,y=e.clientY-r.top,b=restartBtnBounds;
            if(x>b.x&&x<b.x+b.w&&y>b.y&&y<b.y+b.h) restart();
        }
    }

    function loop(t){
        actionPulse*=.82; successPulse*=.92; coinLift*=.94;
        draw(t||0);
        requestAnimationFrame(loop);
    }

    function draw(t){
        drawOperatingRoom(t);
        drawPatient(t);
        if(state==='closed') drawIncisionTarget(t);
        if(state==='open'||state==='stitching') drawOpenWound(t);
        if(state==='stitching') drawStitches(t);
        drawCursor(t);
        drawHUD(t);
        if(feedbackTimer>0){ drawFeedback(); feedbackTimer--; }
        if(state==='done') drawEndScreen(true,t);
        if(state==='failed') drawEndScreen(false,t);
    }

    function roundRect(x,y,w,h,r){
        ctx.beginPath();ctx.moveTo(x+r,y);ctx.arcTo(x+w,y,x+w,y+h,r);
        ctx.arcTo(x+w,y+h,x,y+h,r);ctx.arcTo(x,y+h,x,y,r);ctx.arcTo(x,y,x+w,y,r);
        ctx.closePath();
    }

    function shadowedRect(x,y,w,h,r,fill,shadow='rgba(0,0,0,.2)'){
        ctx.save();ctx.shadowColor=shadow;ctx.shadowBlur=25;ctx.shadowOffsetY=10;
        ctx.fillStyle=fill;roundRect(x,y,w,h,r);ctx.fill();ctx.restore();
    }

    function drawOperatingRoom(t){
        const bg=ctx.createLinearGradient(0,0,0,height);
        bg.addColorStop(0,'#081b23');bg.addColorStop(.55,'#12353b');bg.addColorStop(1,'#061015');
        ctx.fillStyle=bg;ctx.fillRect(0,0,width,height);

        // Ceiling lights
        for(let i=0;i<5;i++){
            const x=width*(.1+i*.2);
            ctx.save();ctx.globalAlpha=.65;
            const g=ctx.createRadialGradient(x,height*.05,5,x,height*.05,width*.12);
            g.addColorStop(0,'rgba(255,255,255,.55)');g.addColorStop(1,'rgba(120,210,220,0)');
            ctx.fillStyle=g;ctx.fillRect(x-width*.14,0,width*.28,height*.35);ctx.restore();
        }

        // Operating-table rails
        ctx.strokeStyle='rgba(255,255,255,.08)';ctx.lineWidth=8;
        ctx.beginPath();ctx.moveTo(0,height*.83);ctx.lineTo(width,height*.83);ctx.stroke();
        ctx.strokeStyle='rgba(255,255,255,.05)';ctx.lineWidth=2;
        for(let x=0;x<width;x+=80){ctx.beginPath();ctx.moveTo(x,height*.83);ctx.lineTo(x+30,height);ctx.stroke();}
    }

    function drawPatient(t){
        const cx=width*.5, cy=height*.59;
        const bodyW=Math.min(width*.58,Math.max(420,width*.64));
        const bodyH=height*.7;

        // Full silhouette: head, neck, shoulders, torso.
        ctx.save();
        ctx.shadowColor='rgba(0,0,0,.35)';ctx.shadowBlur=35;ctx.shadowOffsetY=18;

        const skin=ctx.createLinearGradient(0,cy-bodyH*.5,0,cy+bodyH*.5);
        skin.addColorStop(0,'#f0c3a1');skin.addColorStop(.48,'#e6b28d');skin.addColorStop(1,'#c98e70');
        ctx.fillStyle=skin;
        roundRect(cx-bodyW*.5,cy-bodyH*.22,bodyW,bodyH*.58,bodyW*.15);ctx.fill();

        // shoulders
        ctx.beginPath();ctx.ellipse(cx,cy-bodyH*.12,bodyW*.55,bodyH*.16,0,0,Math.PI*2);ctx.fill();
        // neck
        roundRect(cx-bodyW*.11,cy-bodyH*.39,bodyW*.22,bodyH*.2,20);ctx.fill();
        // head
        ctx.beginPath();ctx.ellipse(cx,cy-bodyH*.5,bodyW*.16,bodyH*.17,0,0,Math.PI*2);ctx.fill();
        ctx.restore();

        // Hair / face details
        ctx.fillStyle='#5a4038';
        ctx.beginPath();ctx.arc(cx-bodyW*.05,cy-bodyH*.53,bodyW*.13,Math.PI*1.05,Math.PI*1.95);ctx.fill();
        ctx.fillStyle='rgba(40,30,30,.35)';
        ctx.beginPath();ctx.ellipse(cx-bodyW*.055,cy-bodyH*.48,4,5,0,0,Math.PI*2);ctx.ellipse(cx+bodyW*.055,cy-bodyH*.48,4,5,0,0,Math.PI*2);ctx.fill();

        // Blue sterile drapes leave the abdomen visible.
        ctx.fillStyle='#1d5a72';
        ctx.globalAlpha=.92;
        ctx.fillRect(0,height*.05,width,height*.28);
        ctx.fillRect(0,height*.2,cx-bodyW*.32,height*.8);
        ctx.fillRect(cx+bodyW*.32,height*.2,width-(cx+bodyW*.32),height*.8);
        ctx.globalAlpha=1;

        // Central surgical opening / towel
        shadowedRect(cx-bodyW*.30,cy-bodyH*.17,bodyW*.60,bodyH*.44,30,'#e5b18b','rgba(0,0,0,.16)');
        ctx.fillStyle='rgba(17,58,68,.9)';
        roundRect(cx-bodyW*.27,cy-bodyH*.10,bodyW*.54,bodyH*.34,24);ctx.fill();

        // Sterile blue towel border
        ctx.strokeStyle='#4e91a5';ctx.lineWidth=18;
        roundRect(cx-bodyW*.31,cy-bodyH*.19,bodyW*.62,bodyH*.48,34);ctx.stroke();
    }

    function drawIncisionTarget(t){
        const x=incisionZone.x*width,y=incisionZone.y*height,w=incisionZone.w*width,h=incisionZone.h*height;
        const pulse=1+Math.sin(t*.006)*.08;
        ctx.save();ctx.translate(x,y);ctx.scale(pulse, pulse);
        ctx.shadowColor='rgba(255,92,104,.7)';ctx.shadowBlur=18;
        ctx.strokeStyle='#ff5c68';ctx.lineWidth=4;ctx.setLineDash([10,7]);
        roundRect(-w,-h,w*2,h*2,12);ctx.stroke();ctx.setLineDash([]);
        ctx.fillStyle='#ff7c86';ctx.font='800 14px Segoe UI';ctx.textAlign='center';
        ctx.fillText('INCISION TARGET',0,-h-14);ctx.restore();
    }

    function drawOpenWound(t){
        const x=incisionZone.x*width,y=incisionZone.y*height,w=incisionZone.w*width,h=incisionZone.h*height;
        const grad=ctx.createLinearGradient(x,y-h,x,y+h);
        grad.addColorStop(0,'#7b2631');grad.addColorStop(.5,'#3a1420');grad.addColorStop(1,'#6f2330');
        ctx.save();ctx.shadowColor='rgba(0,0,0,.4)';ctx.shadowBlur=20;
        ctx.fillStyle=grad;roundRect(x-w,y-h,w*2,h*2,14);ctx.fill();
        ctx.strokeStyle='#c44755';ctx.lineWidth=5;roundRect(x-w,y-h,w*2,h*2,14);ctx.stroke();
        ctx.restore();

        if(state==='open'){
            const coinX=x, coinY=y-coinLift*height*.08;
            const r=coinRadius*width;
            ctx.save();ctx.shadowColor='rgba(255,209,102,.6)';ctx.shadowBlur=18;
            const cg=ctx.createRadialGradient(coinX-r*.35,coinY-r*.35,2,coinX,coinY,r);
            cg.addColorStop(0,'#fff4b0');cg.addColorStop(.4,'#ffd166');cg.addColorStop(1,'#b86b14');
            ctx.fillStyle=cg;ctx.beginPath();ctx.arc(coinX,coinY,r,0,Math.PI*2);ctx.fill();
            ctx.strokeStyle='#8b5313';ctx.lineWidth=2;ctx.stroke();
            ctx.fillStyle='rgba(100,60,10,.65)';ctx.font=`bold ${Math.max(12,r*.8)}px serif`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('C',coinX,coinY);
            ctx.restore();
        }
    }

    function drawStitches(t){
        const x=incisionZone.x*width,y=incisionZone.y*height,w=incisionZone.w*width;
        for(let i=0;i<stitchCount;i++){
            const sx=x-w+(w*2*(i+1))/(STITCHES_NEEDED+1);
            ctx.save();ctx.strokeStyle='#d7eef2';ctx.lineWidth=3;ctx.lineCap='round';
            ctx.shadowColor='rgba(0,0,0,.4)';ctx.shadowBlur=5;
            ctx.beginPath();ctx.moveTo(sx-7,y-11);ctx.lineTo(sx+7,y+11);ctx.moveTo(sx+7,y-11);ctx.lineTo(sx-7,y+11);ctx.stroke();
            ctx.restore();
        }
    }

    function drawCursor(t){
        const x=cursorX*width,y=cursorY*height;
        ctx.save();ctx.translate(x,y);
        const pulse=1+actionPulse*.18;
        ctx.scale(pulse,pulse);

        // Target ring
        ctx.strokeStyle='rgba(255,255,255,.9)';ctx.lineWidth=2;
        ctx.beginPath();ctx.arc(0,0,20,0,Math.PI*2);ctx.stroke();
        ctx.strokeStyle='rgba(53,208,176,.7)';ctx.beginPath();ctx.arc(0,0,26,0,Math.PI*2);ctx.stroke();
        ctx.fillStyle='#fff';ctx.beginPath();ctx.arc(0,0,3,0,Math.PI*2);ctx.fill();

        if(selectedTool==='scalpel') drawScalpel();
        else if(selectedTool==='forceps') drawForceps();
        else drawNeedle();
        ctx.restore();
    }

    function drawScalpel(){
        ctx.save();ctx.rotate(-.72);
        ctx.shadowColor='rgba(0,0,0,.45)';ctx.shadowBlur=8;
        ctx.fillStyle='#374151';roundRect(-10,-5,46,11,5);ctx.fill();
        ctx.fillStyle='#dbeafe';roundRect(25,-4,20,9,3);ctx.fill();
        ctx.fillStyle='#f3f4f6';ctx.beginPath();ctx.moveTo(42,-4);ctx.lineTo(61,0);ctx.lineTo(42,5);ctx.closePath();ctx.fill();
        ctx.restore();
    }
    function drawForceps(){
        ctx.save();ctx.rotate(-.45);ctx.strokeStyle='#dbe4ea';ctx.lineWidth=6;ctx.lineCap='round';
        ctx.beginPath();ctx.moveTo(-4,5);ctx.lineTo(-28,-24);ctx.moveTo(4,5);ctx.lineTo(28,-24);ctx.stroke();
        ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(-4,5);ctx.lineTo(0,29);ctx.moveTo(4,5);ctx.lineTo(0,29);ctx.stroke();
        ctx.restore();
    }
    function drawNeedle(){
        ctx.save();ctx.rotate(-.35);ctx.strokeStyle='#dce9ef';ctx.lineWidth=4;
        ctx.beginPath();ctx.arc(0,0,19,Math.PI*.15,Math.PI*1.45);ctx.stroke();
        ctx.strokeStyle='#35d0b0';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(12,-13);ctx.lineTo(38,11);ctx.stroke();
        ctx.restore();
    }

    function drawHUD(t){
        ctx.save();
        // top glass bar
        ctx.fillStyle='rgba(4,13,18,.68)';roundRect(18,18,width-36,64,18);ctx.fill();
        ctx.strokeStyle='rgba(255,255,255,.1)';ctx.stroke();

        ctx.textAlign='left';ctx.fillStyle='#fff';ctx.font='900 18px Segoe UI';
        ctx.fillText('REAL SURGEON',36,45);
        ctx.fillStyle='#9eb2bb';ctx.font='700 12px Segoe UI';
        ctx.fillText('OPENWII MEDICAL SIMULATOR',36,64);

        ctx.textAlign='center';
        let instruction='';
        if(state==='closed') instruction='SCALPEL  •  OPEN THE INCISION';
        if(state==='open') instruction='FORCEPS  •  REMOVE THE COIN';
        if(state==='stitching') instruction=`NEEDLE  •  STITCH THE WOUND  ${stitchCount}/${STITCHES_NEEDED}`;
        ctx.fillStyle='#dff9f5';ctx.font='900 16px Segoe UI';ctx.fillText(instruction,width/2,53);

        ctx.textAlign='right';ctx.fillStyle='#ffd6da';ctx.font='900 17px Segoe UI';
        ctx.fillText('♥ '.repeat(lives).trim(),width-36,45);
        ctx.fillStyle='#fff';ctx.font='800 12px Segoe UI';ctx.fillText(`SCORE ${score}`,width-36,64);
        ctx.restore();
    }

    function drawFeedback(){
        ctx.save();ctx.globalAlpha=Math.min(1,feedbackTimer/18);
        ctx.textAlign='center';ctx.font='900 22px Segoe UI';ctx.fillStyle=feedbackColor;
        ctx.shadowColor='rgba(0,0,0,.8)';ctx.shadowBlur=12;ctx.fillText(feedbackMsg,width/2,height*.82);ctx.restore();
    }

    function drawEndScreen(success,t){
        ctx.fillStyle='rgba(2,8,12,.76)';ctx.fillRect(0,0,width,height);
        const boxW=Math.min(560,width-40),boxH=310,bx=width/2-boxW/2,by=height/2-boxH/2;
        shadowedRect(bx,by,boxW,boxH,28,'rgba(12,29,36,.94)','rgba(0,0,0,.5)');
        ctx.textAlign='center';ctx.fillStyle=success?'#35d0b0':'#ff5c68';
        ctx.font='1000 38px Segoe UI';ctx.fillText(success?'SURGERY COMPLETE':'SURGERY FAILED',width/2,by+75);
        ctx.fillStyle='#fff';ctx.font='700 18px Segoe UI';
        ctx.fillText(`Score ${score}`,width/2,by+120);
        if(success) ctx.fillText(`Time ${elapsedSeconds}s`,width/2,by+150);

        const bw=220,bh=54,bx2=width/2-bw/2,by2=by+190;
        restartBtnBounds={x:bx2,y:by2,w:bw,h:bh};
        ctx.fillStyle='#2388a8';roundRect(bx2,by2,bw,bh,16);ctx.fill();
        ctx.fillStyle='#fff';ctx.font='900 17px Segoe UI';ctx.fillText('RESTART SURGERY',width/2,by2+34);
    }

    return {init,setCursor,setTool,performAction,setOnFeedback};
})();
