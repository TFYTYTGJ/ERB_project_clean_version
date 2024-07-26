var express = require('express');
var router = express.Router();

const MongoClient = require('mongodb').MongoClient;
const config = require('./config');
const db = config.db;
const client = new MongoClient(config.url);
const ObjectId = require('mongodb').ObjectId;
const auth = require('./auth');
const path = require('path');
const fs = require('fs');
const {upload} = require('./multer');
const {searchRating} = require('./searchRating');

const now = new Date();

const courses_c = client.db(db).collection("courses");
const users_c = client.db(db).collection('users');
const buyRecords_c = client.db(db).collection("buyRecords");

/* GET courses page. */
//show all courses, pass course object to ejs. Can see the comments
router.get('/', auth.isloginByStudent, async (req,res)=>{
    //get all courses and ratings from database
    try {
        await client.connect();
        let courses = await courses_c.find().toArray();
    //map all authors and course ids into arrays from all courses
        let courseauthor_a = courses.map((courses)=>courses.author);

        //for courses in database, convert author names from _id to their related username
        for (let i=0;i<courses.length;i++) {
        let courseauthor_b = await users_c.findOne({_id:courseauthor_a[i]}); //get all author data by author id
        if(courseauthor_b) courses[i].author = courseauthor_b.username;
        else courses[i].author = "已刪除帳戶的導師";
        courses[i].rate = 0;
        }

        //for courses in database, calculate their related average rating
        courses = await searchRating(courses);
        if(courses) res.render('courses_all',{courses:courses,now, search:{method:"words",param:""}});
    } finally {
        await client.close();
    }
    
}).post('/', auth.isloginByStudent,async (req,res)=>{
    let {searchMethod} = req.body;
    try {
        await client.connect();
        if(searchMethod == "words"){
            let {searchWords} = req.body;
            let searchByWords = await courses_c.find({name:{$regex:searchWords}}).toArray();
            for(let i=0; i<searchByWords.length;i++){
                searchByWords[i].id = searchByWords[i].author;
                let findAuthorName = await users_c.findOne({_id:searchByWords[i].id});
                if(findAuthorName) searchByWords[i].author = findAuthorName.username;
                else searchByWords[i].author = "已刪除的作者";
            }
            searchByWords = await searchRating(searchByWords);
            res.render('courses_all',{courses:searchByWords,now, search:{method:"words",param:searchWords}});
        } else if(searchMethod == "category"){
            let {category} = req.body;
            let searchByCategory;
            if(category=="all") searchByCategory = await courses_c.find().toArray();
            else searchByCategory = await courses_c.find({category:category}).toArray();
            for(let i=0; i<searchByCategory.length;i++){
                searchByCategory[i].id = searchByCategory[i].author;
                let findAuthorName = await users_c.findOne({_id:searchByCategory[i].id});
                if(findAuthorName) searchByCategory[i].author = findAuthorName.username;
                else searchByCategory[i].author = "已刪除的作者";
            }
            searchByCategory = await searchRating(searchByCategory);
            res.render('courses_all',{courses:searchByCategory,now, search:{method:"category",param:category}});
        } else if(searchMethod == "tutor"){
            let {searchWords} = req.body;
            let searchTutor = await users_c.find({username:{$regex:searchWords}, type:"teacher"}).toArray();
            let authorName = [];
            for(const i of searchTutor) {
                authorName.push(i._id);
            }
            let searchByAuthorId = await courses_c.find({author:{$in:authorName}}).toArray();
            for(let i=0;i<searchByAuthorId.length;i++){
                searchByAuthorId[i].id = searchByAuthorId[i].author;
                let findAuthorName = await users_c.findOne({_id:searchByAuthorId[i].id});
                if(findAuthorName) searchByAuthorId[i].author = findAuthorName.username;
                else searchByAuthorId[i].author = "已刪除的作者";
            }
            searchByAuthorId = await searchRating(searchByAuthorId);
            res.render('courses_all',{courses:searchByAuthorId,now, search:{method:"words",param:searchWords}});
        } 
        else res.redirect('/courses');
    } finally {
        await client.close();
    }

}).get('/paid', auth.isloginByStudent,async (req,res)=>{
    //only students can see the page.  Show the course student attended, pass only the course student attended
    let courses=[];
    try{
        await client.connect();
        let buyRecords = await buyRecords_c.find({userId:new ObjectId(req.user._id)}).toArray();
        if(buyRecords){
            for (const i of buyRecords){
                let boughtcourses = await courses_c.findOne({_id:i.courseId});
                if(boughtcourses) courses.push(boughtcourses);
            }
            for (let i=0;i<courses.length;i++){
                let courseauthor = await users_c.findOne({_id:courses[i].author});
                if(courseauthor) courses[i].author = courseauthor.username;
                else courses[i].author = "Deleted author"
                
            }
            courses = await searchRating(courses);
            res.render('courses_paid',{courses:courses,now});
        } else {
            res.render('courses_paid',{courses:[],now, message:"你沒有任何購買紀錄！"});
        }
    } finally{
        await client.close();
    }

}).get('/myCourses', auth.isloginByTeacher, async(req,res)=>{
    //only teachers can visit the page.
    try {
        await client.connect();
        //convert author name from _id to username of the author
        let data = await courses_c.find({author:new ObjectId(req.user._id)}).toArray();
        if(data.length>=1){
        let courseauthor = await users_c.findOne({_id:data[0].author})
        if(courseauthor){
            let authorname = courseauthor.username;
            for (let i=0;i<data.length;i++) {
            data[i].author = authorname;
            }
        }
        data = await searchRating(data);
        res.render("courses_myCourses", {
            courses: data,now
        });
        } else res.render("courses_myCourses", {
            courses: [],now
        });
        
    } finally {
        await client.close();
    }
}).get('/myCourses/:courseId', auth.isloginByTeacher,async(req,res)=>{
    const {courseId} = req.params;
    //only course owner can see the page.  Course owner can edit the data, show the form that allow course owner to edit.
    if(courseId.length == 24){
        try {
            await client.connect();
            let course = await courses_c.findOne({_id:new ObjectId(courseId)});
            if (course && course.author.toString()==req.user._id.toString()) {
                res.render("courses_myCourses_edit", {
                    course: course,now
                });
            } else res.redirect('/courses/myCourses');
        } finally {
            await client.close();
        }
    } else res.redirect('/courses/myCourses');

    /* handle course update or delete */
}).post('/myCourses/:courseId', auth.isloginByTeacher, upload.fields([{name: 'videoLink', maxCount:1},
    {name: 'photoLink', maxCount:1}]), async(req,res)=>{
    const {courseId} = req.params;
    //check if the courseId is valid
    if(courseId.length == 24){
        try {
            await client.connect();
                  //data validations, output corresponding fail message, or update course data
            const isNameReplicated = await courses_c.findOne({ name: req.body.name });
            if (isNameReplicated && isNameReplicated._id.toString() != courseId) req.session.messages.push("課程名稱已被使用");
            if(!Number.isInteger(Number(req.body.money))) req.session.messages.push("課程價錢必須為整數數字");
            if (!!req.session.messages.length) res.redirect(`/courses/myCourses/${req.params.courseId}`);
            else { //handle data if passed previous checks
                const videoLink = req.files.videoLink ? req.files.videoLink[0]: null; //set object video to null if no video is uploaded
                if (videoLink != null) { //setup renaming format if video exists
                    const videoextension = path.extname(videoLink.originalname);
                    let videoLinkPath = req.files.videoLink ? `./public/videos/${courseId}_video${videoextension}` : null;
                    if (videoLinkPath) { //rename video in directory if video exists
                    fs.rename(videoLink.path, videoLinkPath, (err) => {
                        if (err) throw err;
                    });
                    }
                }
                /* ...photo... */
                const photoLink = req.files.photoLink ? req.files.photoLink[0]: null;
                if (photoLink != null) {
                    const photoextension = path.extname(photoLink.originalname);
                    let photoLinkPath = req.files.photoLink ? `./public/images/${courseId}_photo${photoextension}` : null;
                    if (photoLinkPath) {
                        fs.rename(photoLink.path, photoLinkPath, (err) => {
                            if (err) throw err;
                        });
                    }
                }
                // setup the new data set
                // if video or photo data exists in database, do not replace it with null
                newSet =  {
                    name: req.body.name,
                    introduction: req.body.introduction,
                    money: parseInt(req.body.money),
                    content: req.body.content,
                    whatPeopleLearn: req.body.whatPeopleLearn,
                    category: req.body.category
                }
                if(videoLink != null)newSet.video = videoLink;
                if(photoLink != null)newSet.photo = photoLink;
                let newData = await courses_c.updateOne({ _id: new ObjectId(courseId) }, {$set:newSet});
                if (newData.matchedCount == 1) {
                    req.session.messages.push("更改資料成功");
                } else { //if occur any unexpected error e.g. connection failure
                    req.session.messages.push("更改資料失敗。請重新嘗試");
                }       
                if (!!req.session.messages.length) res.redirect(`/courses/myCourses/${req.params.courseId}`);
            }
        } finally {
            await client.close();
        }
    } else res.redirect('/courses/myCourses');
}).get('/myCourses/:courseId/delete', auth.isloginByTeacher,async(req,res)=>{
    const {courseId} = req.params;
    //only course owner can delete their own course
        try {
            await client.connect();
            const expirationTime = new Date(Date.now() + 604800000);
            await courses_c.updateOne({_id:new ObjectId(courseId)},{$set:{PendToDelete:expirationTime} });
            res.redirect('/courses/myCourses/');
        } finally {
            await client.close();
        }
}).get('/myCourses/:courseId/undoDelete', auth.isloginByTeacher,async(req,res)=>{
    const {courseId} = req.params;
    //only course owner can undo deletion
        try {
            await client.connect();
            await courses_c.updateMany({_id:new ObjectId(courseId)},{$unset:{PendToDelete:""}});
            res.redirect('/courses/myCourses/');
        } finally {
            await client.close();
        }
}).get('/newCourse', auth.isloginByTeacher, (req,res)=>{
    res.render('courses_newCourse',{
        user: req.user});
    
}).post('/newCourse', auth.isloginByTeacher, upload.fields([{name: 'videoLink', maxCount:1},
    {name: 'photoLink', maxCount:1}]), async(req,res)=>{
    //add course to database
    try {
        await client.connect();
        const videoLink = req.files.videoLink ? req.files.videoLink[0]: null; //set object video to null if no video is uploaded
        
    
        /* ...photo... */
        const photoLink = req.files.photoLink ? req.files.photoLink[0]: null;
            
        // setup the new data set
        // if no video or photo is uploaded, assign corresponding default file
        newSet =  {
            name: req.body.name,
            introduction: req.body.introduction,
            money: parseInt(req.body.money),
            content: req.body.content,
            author: req.user._id,
            whatPeopleLearn: req.body.whatPeopleLearn,
            video: videoLink,
            photo: photoLink,
            category: req.body.category
        }

        //check course name, output an error message if course name is replicated
        const isNameReplicated = await courses_c.findOne({ name: req.body.name });
        if (isNameReplicated) req.session.messages.push("課程名稱已被使用");
        if(!Number.isInteger(Number(req.body.money))) req.session.messages.push("課程價錢必須為整數數字");
        if (!!req.session.messages.length) res.redirect(`/courses/newCourse`);
        else {
                let insertData = await courses_c.insertOne(newSet);
                if(insertData.acknowledged) {
                    const courseId = insertData.insertedId;
                    if (videoLink != null) { //setup renaming format if video exists
                        const videoextension = path.extname(videoLink.originalname);
                        let videoLinkPath = req.files.videoLink ? `./public/videos/${courseId}_video${videoextension}` : null;
                        if (videoLinkPath) { //rename video in directory if video exists
                            fs.rename(videoLink.path, videoLinkPath, (err) => {
                                if (err) throw err;
                            });
                        }
                    }
                    if (photoLink != null) {
                        const photoextension = path.extname(photoLink.originalname);
                        let photoLinkPath = req.files.photoLink ? `./public/images/${courseId}_photo${photoextension}` : null;
                        if (photoLinkPath) {
                            fs.rename(photoLink.path, photoLinkPath, (err) => {
                                if (err) throw err;
                            });
                        }
                    }
                    req.session.messages.push("新增課程成功");
                } else { //if occur any unexpected error e.g. connection failure
                    req.session.messages.push("新增課程失敗。請重新嘗試");
                }       
                if (!!req.session.messages.length) res.redirect(`/courses/newCourse/`);
            }
    } finally {
    await client.close();
    }
  
}).get('/:courseId', auth.isloginByStudent, async (req, res)=>{
    const {courseId} = req.params;
    if(courseId.length == 24){

        let msg="";
        if(req.query.msg==1) msg="評分成功";
        else if(req.query.msg==2) msg="評分失敗";
        else if(req.query.msg==3) msg="評分錯誤";
        else if(req.query.msg==4) msg="購買成功";
        else if(req.query.msg==5) msg="購買失敗";
        //get single course detail by course id
        try {
            await client.connect();
            let courses = await courses_c.findOne({_id:new ObjectId(courseId)});
            if(courses){
                //replace author id with author name and find the introduction of author
                courseauthor =  await users_c.findOne({_id:courses.author}); 
                if(courseauthor) {
                    courses.author = courseauthor.username;
                    courses.authorDetails = courseauthor.introduction;
                }
                else {
                    courses.author = "已刪除的作者";
                    courses.authorDetails = "已刪除的作者";
                }
                let userId = req.user._id;
                let courseId = courses._id;
                let buyRecords = await buyRecords_c.findOne({courseId:courseId,userId:userId});
                const paid = buyRecords? true:false;
                const rate = paid&&buyRecords.rate?  buyRecords.rate: null;
                res.render('courses_detail',{course:courses,now,msg:msg, paid:paid,rate:rate});
                
            } else res.redirect('/courses');
        }finally {
            await client.close();
        }
    } else res.redirect('/courses');
    
}).post('/:courseId', auth.isloginByStudent, async (req, res)=>{
    const {courseId} = req.params;
    if(courseId.length == 24){
        try {
            await client.connect();
            let data = Number(req.body.rate);
            if (data >5 || data <0) {
                req.session.messages.push("評分錯誤，請重試");
            }
            else {
                let updateRecords = await buyRecords_c.updateOne({$and:[{userId:req.user._id}, {courseId:new ObjectId(courseId)}]},{$set:{rate:data}});
                if(updateRecords.matchedCount > 0) req.session.messages.push("評分成功");
                else req.session.messages.push("評分失敗，請重試");
            }
            res.redirect(`/courses/${courseId}`);
        }finally {
            await client.close();
        }
    } else res.redirect('/courses');
    
}).get('/:courseId/buy', auth.isloginByStudent, async(req, res)=>{
    const {courseId} = req.params;
    if(courseId.length == 24){
        try {
            await client.connect();
            //insert buy record at database.
            let course = await courses_c.findOne({_id:new ObjectId(courseId)});
            let user = await users_c.findOne({_id:req.user._id});
            let userTeacher = await users_c.findOne({_id:course.author});
            if (user.money >= course.money) {
                let canBuy = true;
                if (canBuy) {
                    //學生剩餘錢
                    let balance = user.money -= course.money;
                    //老師增加收入後的錢
                    if (userTeacher) {
                        balanceTeacher= userTeacher.money += course.money;
                    }
                    await buyRecords_c.insertOne({userId:req.user._id, courseId:new ObjectId(courseId)});
                    await users_c.updateOne({_id:req.user._id}, {$set: {money: balance}});
                    if (userTeacher) await users_c.updateOne({_id:course.author}, {$set: {money: balanceTeacher}});
                    res.redirect(`/courses/${courseId}?msg=4`)
                }
            } else{ res.redirect(`/courses/${courseId}?msg=5`)}
            
        } finally {
            await client.close();
        }
    } else res.redirect('/courses');
});

module.exports = router;