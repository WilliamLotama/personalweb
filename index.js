const express = require('express')

const bcrypt = require('bcrypt')
const session= require('express-session')
const flash = require('express-flash')

const app = express()

const port = process.env.PORT || 5000

const db = require('./connection/db')

const upload = require('./middlewares/fileUpload')




app.set('view engine','hbs') //set view engine hbs

app.use('/public', express.static(__dirname + '/public'))
app.use('/uploads', express.static(__dirname + '/uploads'))


app.use(express.urlencoded({extended: false}))

app.use(flash())

app.use(session({
  secret: 'keyboard cat',
  resave: false,
  saveUninitialized: true,
  cookie: { 
    maxAge: 2 * 60 * 60 * 1000 // 2 jam
   }
}))

app.get("/", function(req,res){
  let userId
  let query

  if(req.session.isLogin){
    userId = req.session.user.id
    query = `SELECT tb_user.name as author, tb_user.email, tb_projects.name, tb_projects.id ,tb_projects.start_date,
    tb_projects.end_date, tb_projects.description, 
    tb_projects.technologies, tb_projects.image
    FROM tb_projects LEFT JOIN tb_user ON tb_projects.user_id = tb_user.id WHERE user_id=${userId}`
  }else{
    query = `SELECT tb_user.name as author,tb_projects.id ,tb_user.email, tb_projects.name, tb_projects.start_date,
    tb_projects.end_date, 
    tb_projects.description, 
    tb_projects.technologies, tb_projects.image
    FROM tb_projects LEFT JOIN tb_user ON tb_projects.user_id = tb_user.id`
  }

  db.connect(function(err, client, done) {
    if (err) throw err //kondisi untuk menampilkan error koneksi database

    client.query(query, function(err, result) {
        if (err) throw err // kondisi untuk menampilkan error query 
        done()
        // console.log(result.rows);
        let data = result.rows

        data = data.map(function(item){
          return {
              ...item,
              duration: getDistanceTime(item.start_date, item.end_date),
              isLogin: req.session.isLogin,
              description: item.description.slice(0,50) + '.....'
          }
      })
        res.render('index', {projects:data,isLogin: req.session.isLogin, user: req.session.user})
    })

  })
})


app.get('/myProject', function(req,res){
    res.render('myProject')
})

app.get('/register', function(req,res){
  res.render('register')
})

app.post('/register', function(req,res){
  
  const {inputName, inputEmail, inputPassword} = req.body
  const hashedPassword = bcrypt.hashSync(inputPassword, 10) // 10 hashed/second

  const queryEmail = `SELECT * FROM tb_user WHERE email='${inputEmail}';`

  const queryInsert = `INSERT INTO public.tb_user(
    name, email, password)
    VALUES ('${inputName}', '${inputEmail}', '${hashedPassword}');`

    const timeoutObj = setTimeout(() => {
      res.redirect('/login') 
    }, 2000);
    

  db.connect(function(err,client,done){
    if (err) throw err

    client.query(queryEmail, function(err,result){
        if (err) throw err
        done()
        if(result.rows.length > 0){
            //console.log('Email not found!!');
            req.flash('danger', 'Email Sudah Terdaftar!! Silahkan Masukan Email Baru')
            return res.redirect('/register')
        }else{
          client.query(queryInsert, function(err,result){
            if (err) throw err
            req.flash('success','Data Terdaftar, Silahkan Login')
            res.redirect('/register')           
            clearTimeout(timeoutObj);
          })         
        }
      })   
  })  
})


app.get('/login', function(req, res){
  res.render('login')
})


app.post('/login', function(req, res){
  const {inputEmail, inputPassword} = req.body

  const query = `SELECT * FROM tb_user WHERE email='${inputEmail}';`

  db.connect(function(err, client, done) {
      if (err) throw err

      client.query(query, function(err, result){
          if (err) throw err
          done()

          // melakukan kondisi jika email belum terdaftar
          if(result.rows.length == 0){
              // console.log('Email not found!!');
              req.flash('danger', 'Email belum terdaftar!')
              return res.redirect('/login')
          }

          const isMatch = bcrypt.compareSync(inputPassword, result.rows[0].password )
          // console.log(isMatch);

          if(isMatch){
              // console.log('Login Berhasil');

              // Memasukan data kedalam session
              req.session.isLogin = true,
              req.session.user = {
                  id: result.rows[0].id,
                  name: result.rows[0].name,
                  email: result.rows[0].email
              }

              req.flash('success', 'Login Success')
              res.redirect('/home')
          } else {
              // console.log('Password salah');
              req.flash('danger', 'Password tidak cocok!')
              res.redirect('/login')
          }        
      })
  })

})

app.get('/logout', function(req, res){
  req.session.destroy()

  res.redirect('/home')

})

app.get('/viewProject/:id', function(req,res){
    
  // console.log(req.params.id);
  const id = req.params.id

  db.connect(function(err,client,done){
    if (err) throw err

    client.query(`SELECT * FROM tb_projects WHERE id=${id}`, function(err,result){
        if (err) throw err
        done();

      // console.log(result.rows[0]);

       let data = result.rows
       let blog = data.map(function(item){
          return{
            ...item,
            duration : getDistanceTime(item.start_date,item.end_date),
            js : item.technologies[0],
            java : item.technologies[1],
            html : item.technologies[2],
            android : item.technologies[3],
            namajs : iconName(item.technologies[0])[0],
            namajava : iconName(item.technologies[1])[1],
            namahtml : iconName(item.technologies[2])[2],
            namaandroid : iconName(item.technologies[3])[3]
          }
        })
        // data = result.rows[0]
        blog = blog[0]
        console.log(blog);
        res.render('viewProject',{blog: blog})
    })

  })

})

app.get('/delete-project/:id', function(req, res){

    const id = req.params.id

    const query = `DELETE FROM public.tb_projects
    WHERE id = ${id}`

      db.connect(function(err,client,done){
        if (err) throw err

        client.query(query, function(err,result){
            if (err) throw err

            res.redirect('/home')
          })   

      })  
  
})

app.get('/contact', function(req, res){
    res.render('contact')
})



app.post('/myProject', upload.single('inputImage') ,function(req, res) {
 
  let data = req.body

  const image = req.file.filename
  const authorId = req.session.user.id
  const query = `INSERT INTO public.tb_projects(
    name, start_date, end_date, description, technologies,image, user_id)
    VALUES ('${data.inputTittle}', '${data.inputStartDate}', '${data.inputEndDate}', 
    '${data.inputDesc}','{"${data.js}","${data.android}","${data.java}","${data.html}"}','${image}','${authorId}');`
  
    db.connect(function(err,client,done){
    if (err) throw err

    client.query(query, function(err,result){
        if (err) throw err

        res.redirect('/home')
      })   

  }) 
})

app.get ('/edit-project/:id', (req, res) =>{
  let id =  req.params.id
  // console.log(id);
  db.connect((err, client, done) => {
      if (err) throw err

      client.query (`SELECT * FROM tb_projects WHERE id = ${id}`, (err, result) =>{
          if (err) throw err
          done()
          let data = result.rows[0]
          data.start_date = getFullTime(data.start_date)
          data.end_date = getFullTime(data.end_date)
          
          let js = data.technologies[0]
          let android = data.technologies[1]
          let java = data.technologies[2]
          let html = data.technologies[3]
          
          data = {
            ...data,
            image :
                data.image == 'null'
                ? '/public/image/image1.jpg'
                : '/uploads/' + data.image,
          };

          if (js != 'undefined'){
             js = true
           }else{
             js = false
           }   
           if (java != 'undefined'){
             java = true
           }else{
             java = false
           }
           if(html != 'undefined'){
             html = true
           }else{
             html = false
           }
           if (android != 'undefined'){
             android = true
           }else{
             android = false
           }

          // console.log(data);
          res.render('editProject', {update: data, id,js,java,html,android})
      })
  })
})
// {"${data.js}","${data.android}","${data.java}","${data.html}"}'
app.post ('/edit-project/:id',upload.single('inputImage') ,(req, res) => {
       let id = req.params.id;
       let data = req.body
       console.log(req.file);
       const userId = req.session.user.id
       let query;
       if (req.file) {
      query = `UPDATE tb_projects
      SET name='${data.inputTittle}', start_date='${data.inputStartDate}', 
      end_date='${data.inputEndDate}', description='${data.inputDesc}', 
      technologies='{"${data.js}","${data.android}","${data.java}","${data.html}"}',
       image ='${req.file.filename}', user_id = '${userId}' WHERE id= ${id};`
  } else {
      query = `UPDATE tb_projects
      SET name='${data.inputTittle}',start_date='${data.inputStartDate}', 
      end_date='${data.inputEndDate}', description='${data.inputDesc}', 
      technologies='{"${data.js}","${data.android}","${data.java}","${data.html}"}',
      user_id = '${userId}' WHERE id= ${id};`
    }
  db.connect ((err, client, done) => {
      if (err) throw err

      client.query (query, (err, result) => {
          if (err) throw err
          done()

          res.redirect('/home')

      })
  })

})


function getDistanceTime(start, end) 
{
  let startDate = new Date(start);
  let endDate = new Date(end);
  
  let distance = endDate - startDate; // Menghitung jarak waktu antara waktu mulai dan selesai
  console.log(startDate);
  let miliseconds = 1000; // 1000 miliseconds dalam 1 detik
  let secondInHours = 3600; // 1 jam sama dengan 3600 detik
  let hoursInDay = 24; // 24 jam dalam 1 hari
  let dayInMonth = 31; // 31 hari dalam 1 bulan
  
  let distanceMonth = Math.floor(
    distance / (miliseconds * secondInHours * hoursInDay * dayInMonth) // Untuk menghitung waktu bulan
  );
  let distanceDay = Math.floor(
    distance / (miliseconds * secondInHours * hoursInDay) // Untuk menghitung waktu hari
    );
  let distanceHours = Math.floor(distance / (miliseconds * 60 * 60)); // Untuk menghitung waktu jam
  let distanceMinutes = Math.floor(distance / (miliseconds * 60)); // Untuk menghitung waktu menit
  let distanceSeconds = Math.floor(distance / miliseconds); // Untuk menghitung waktu detik
  
  
  // let dayInMont =  Math.floor(dayInMonth - distanceMonth)
  
  if (distanceMonth > 0) {
    return `${distanceMonth} Mont`;

  } else if (distanceDay > 0) {
    return `${distanceDay} Day`;
  } else if (distanceHours > 0) {
    return `${distanceHours} Hour`;
  } else if (distanceMinutes > 0) {
    return `${distanceMinutes} Minuate`;
  } else {
    return `${distanceSeconds} detik`;
  }
}


function getFullTime(waktu) {
  let month = ['January', 'Febuary', 'March', 'April', 'May', 'June', 'July', 'August', 'Sept', 'October', 'December']
    
    let date = waktu.getDate().toString().padStart(2, "0");

    // console.log(date);
    let monthIndex = (waktu.getMonth() + 1).toString().padStart(2, "0")

    // console.log(month[monthIndex]);

    let year = waktu.getFullYear()
    // console.log(year);

    let hours = waktu.getHours()
    let minutes = waktu.getMinutes()

    let fullTime = `${year}-${monthIndex}-${date}`
    return fullTime
}

function iconName(nama){
  let java = ""
  let js = ""
  let html = ""
  let android = ""

  if(nama == "fa-brands fa-java"){
    java = " Java";
  }else{
    java = " ";
  }
  if (nama == "fa-brands fa-js"){
    js = " Java Script"
  }else{
    js = " "
  }
  if(nama == "fa-brands fa-html5"){
    html = " Html5"
  }else{
    html = " "
  }
  if(nama == "fa-brands fa-android"){
    android = " Android"
  }else{
    android = " "
  }
  return[java,js,html,android]
}

// app.get('/myPorject/:id', function(req,res){
//     // console.log(req.params)  
// })
app.listen(port, function(){
    console.log(`server listen on port ${port}`);
})
